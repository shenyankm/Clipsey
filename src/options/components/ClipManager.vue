<template>
  <a-space direction="vertical" size="large" style="width: 100%;">
    <clip-toolbar
      :search-value="searchQuery"
      :classification-mode="classificationMode"
      :total="searchTotal"
      @update:search-value="handleSearchChange"
      @update:classification-mode="handleClassificationChange"
      @refresh="refreshClips"
    />

    <div>
      <a-card v-if="searchTotal === 0" size="small">
        <a-empty description="暂无摘抄记录" />
        <a-space>
          <a-button size="small" @click="refreshClips">刷新</a-button>
        </a-space>
      </a-card>

      <div v-else>
        <template v-if="isGroupedView">
          <clip-grouped-list
            :groups="groupedClips"
            :is-date-classification="isDateClassification"
            :is-domain-classification="isDomainClassification"
            :is-expanded="isGroupExpanded"
            :toggle-group="toggleGroupExpansion"
            :get-clip-preview="getClipPreview"
            :format-date="formatDateDisplay"
            :get-domain-from-url="getDomainFromUrl"
            :open-clip-detail="openClipDetail"
            :open-clip-action="openClipAction"
            :delete-clip="deleteClip"
          />
        </template>
        <template v-else>
          <clip-table-view
            :columns="columns"
            :data-source="paginatedData"
            :row-key="rowKey"
            :get-domain-from-url="getDomainFromUrl"
            :format-date="formatDateDisplay"
            :open-clip-detail="openClipDetail"
            :open-clip-action="openClipAction"
            :delete-clip="deleteClip"
            :on-table-change="handleTableChangeBridge"
          />
        </template>
      </div>
      <div v-if="pageCount > 1">
        <a-pagination
          v-model:current="currentPage"
          :total="searchTotal"
          :pageSize="pageSize"
          size="small"
          showLessItems
        />
      </div>
    </div>

    <a-modal v-model:open="showModal" title="摘抄详情" :maskClosable="true">
      <template #footer>
        <a-button @click="showModal = false">关闭</a-button>
      </template>
      <a-space direction="vertical">
        <a-typography-text strong>标题:</a-typography-text>
        <a-typography-text>{{ selectedClip?.title || '无标题' }}</a-typography-text>
        <a-typography-text strong>URL:</a-typography-text>
        <a-typography-text>{{ selectedClip?.sourceUrl || '无URL' }}</a-typography-text>
        <a-typography-text strong>内容:</a-typography-text>
        <div v-if="selectedClip && clipHasRichContent(selectedClip)" v-html="resolveClipHtml(selectedClip)"></div>
        <a-typography-text v-else-if="selectedClip">{{ selectedClip.textContent || '暂无内容' }}</a-typography-text>
        <a-typography-text v-else>暂无内容</a-typography-text>
        <a-typography-text strong>创建时间:</a-typography-text>
        <a-typography-text>{{ selectedClipCreatedAt }}</a-typography-text>
      </a-space>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { formatDateForTable } from '@/utils/helpers';
import { useClipSearch } from '../composables/useClipSearch';
import { useClipPagination } from '../composables/useClipPagination';
import { useClipCRUD } from '../composables/useClipCRUD';
import { useBroadcastSync } from '@/composables/useBroadcastSync';
import type { SortBy } from '@/background/services/search-service';
import ClipToolbar from './clip/ClipToolbar.vue';
import ClipGroupedList from './clip/ClipGroupedList.vue';
import ClipTableView from './clip/ClipTableView.vue';

type ClassificationMode = 'none' | 'domain' | 'date';
type ClipGroup = { key: string; label: string; clips: Clip[] };

// 使用组合式函数
const { searchQuery, searchResults, searchTotal, performSearch } = useClipSearch();
const { currentPage, paginatedClips: paginatedData } = useClipPagination(searchResults, 20);
const { deleteClip: deleteClipAction, openClip: openClipAction } = useClipCRUD();

// 使用BroadcastChannel同步
useBroadcastSync('clipsey-storage-sync', () => {
  void refreshClips(false);
});

const showModal = ref(false);
const selectedClip = ref<Clip | null>(null);
const pageSize = 20;
const classificationMode = ref<ClassificationMode>('none');

const isDateClassification = computed(() => classificationMode.value === 'date');
const isDomainClassification = computed(() => classificationMode.value === 'domain');

const groupExpansionState = ref<Record<string, boolean>>({});

function isGroupExpanded(key: string): boolean {
  const state = groupExpansionState.value[key];
  return state !== undefined ? state : true;
}

function toggleGroupExpansion(key: string): void {
  groupExpansionState.value = {
    ...groupExpansionState.value,
    [key]: !isGroupExpanded(key)
  };
}

const selectedClipCreatedAt = computed(() => {
  const createdAt = selectedClip.value?.createdAt;
  return createdAt ? formatDateForTable(createdAt) : '未知';
});

const isGroupedView = computed(() => classificationMode.value !== 'none');

const groupedClips = computed<ClipGroup[]>(() => {
  if (!isGroupedView.value) return [];
  const mode = classificationMode.value;
  const buckets: ClipGroup[] = [];
  const map = new Map<string, ClipGroup>();

  for (const clip of paginatedData.value) {
    const { key, label } = getGroupMeta(clip, mode);
    let group = map.get(key);
    if (!group) {
      group = { key, label, clips: [] };
      map.set(key, group);
      buckets.push(group);
    }
    group.clips.push(clip);
  }

  return buckets;
});

watch(classificationMode, () => {
  groupExpansionState.value = {};
});

watch(
  () => groupedClips.value,
  groups => {
    const prevState = groupExpansionState.value;
    const nextState: Record<string, boolean> = {};

    for (const group of groups) {
      nextState[group.key] = prevState[group.key] ?? true;
    }

    groupExpansionState.value = nextState;
  },
  { immediate: true }
);

type SortDirection = 'asc' | 'desc';
const DEFAULT_SORT_COLUMN: SortBy = 'createdAt';
const DEFAULT_SORT_ORDER: SortDirection = 'desc';
const SORTABLE_COLUMNS: SortBy[] = ['title', 'sourceUrl', 'textContent'];

const sortColumn = ref<SortBy>(DEFAULT_SORT_COLUMN);
const sortOrder = ref<SortDirection>(DEFAULT_SORT_ORDER);

function isSortableColumn(key: unknown): key is SortBy {
  return typeof key === 'string' && SORTABLE_COLUMNS.includes(key as SortBy);
}

function getSortOptions() {
  return {
    sortBy: sortColumn.value,
    sortOrder: sortOrder.value
  } as const;
}

function resetPageAndSearch(): void {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
  } else {
    void performSearch(currentPage.value, pageSize, getSortOptions());
  }
}

// Table 事件：根据排序状态触发查询
function handleTableChange(_pagination: any, _filters: any, sorter: any) {
  if (!sorter) {
    return;
  }

  const columnKey = sorter.columnKey ?? sorter.field;
  if (isSortableColumn(columnKey) && sorter.order) {
    sortColumn.value = columnKey;
    sortOrder.value = sorter.order === 'ascend' ? 'asc' : 'desc';
  } else if (isSortableColumn(columnKey) && !sorter.order) {
    sortColumn.value = columnKey;
    sortOrder.value = DEFAULT_SORT_ORDER;
  } else {
    sortColumn.value = DEFAULT_SORT_COLUMN;
    sortOrder.value = DEFAULT_SORT_ORDER;
  }
}

const pageCount = computed(() => {
  if (searchTotal.value <= 0) return 1;
  return Math.ceil(searchTotal.value / pageSize);
});

// 表格列定义（使用 Ant Design Vue 的 Table）
const columns = computed(() => [
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    width: 180,
    ellipsis: true
  },
  {
    title: '网址',
    dataIndex: 'sourceUrl',
    key: 'sourceUrl',
    width: 200
  },
  {
    title: '内容',
    dataIndex: 'textContent',
    key: 'textContent',
    ellipsis: true
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    align: 'center'
  }
]);

// Mentions 选项通过插槽提供，无需在脚本中定义

function resolveClipHtml(clip: Clip): string {
  return getClipHtmlContent(clip);
}

function clipHasRichContent(clip: Clip): boolean {
  return hasClipRichContent(clip);
}

function getGroupMeta(clip: Clip, mode: ClassificationMode): { key: string; label: string } {
  if (mode === 'domain') {
    const domain = getDomainFromUrl(clip.sourceUrl) || '无网址';
    return { key: `domain:${domain}`, label: domain };
  }
  const label = formatGroupDate(clip.createdAt);
  return { key: `date:${label}`, label };
}

function formatGroupDate(isoString: string | undefined): string {
  if (!isoString) return '未知日期';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}


function getClipPreview(clip: Clip): string {
  const content = clip.textContent ?? '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return clip.title?.trim() || '暂无内容';
  }
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

function getDomainFromUrl(url: string | undefined): string {
  /** 从URL提取顶级域名（去掉www前缀），用于表格展示来源站点。 */
  if (!url) {
    return '';
  }
  try {
    const hostname = new URL(url).hostname;
    // 移除 'www.' 前缀（如果存在）
    return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
  } catch (error) {
    console.error('无效的URL:', url, error);
    return url; // 解析失败时返回原始URL
  }
}



// 监听搜索查询变化
watch(searchQuery, () => {
  resetPageAndSearch();
});

// 监听排序变化
watch([sortColumn, sortOrder], () => {
  resetPageAndSearch();
});

// 监听分页变化
watch(currentPage, () => {
  void performSearch(currentPage.value, pageSize, getSortOptions());
});

/** 刷新摘抄列表。 */
async function refreshClips(showMessage = true) {
  await performSearch(currentPage.value, pageSize, getSortOptions());
  if (showMessage) {
    message.success('已刷新');
  }
}

/** 删除摘抄。 */
async function deleteClip(id: string) {
  const success = await deleteClipAction(id);
  if (success) {
    // 删除成功后重新搜索
    await performSearch(currentPage.value, pageSize, getSortOptions());
  }
}

/** 打开摘抄详情弹窗。 */
function openClipDetail(clip: Clip) {
  selectedClip.value = clip;
  showModal.value = true;
}

/** 初始化组件并执行首次搜索。 */
onMounted(() => {
  void performSearch(currentPage.value, pageSize, getSortOptions());
});

// Table 唯一键
const rowKey = (record: Clip) => record.id;

function handleSearchChange(value: string) {
  searchQuery.value = value;
}

function handleClassificationChange(value: ClassificationMode) {
  classificationMode.value = value;
}

function handleTableChangeBridge(pagination: any, filters: any, sorter: any) {
  handleTableChange(pagination, filters, sorter);
}

function formatDateDisplay(value?: string): string {
  return value ? formatDateForTable(value) : '--';
}
</script>
