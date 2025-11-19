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
        <a-empty :description="t('clipNoRecords')" />
        <a-space>
          <a-button size="small" @click="refreshClips">{{ t('clipRefreshButton') }}</a-button>
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
            :opening-id="openingId"
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
            :opening-id="openingId"
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

    <a-modal v-model:open="showModal" :title="t('clipModalTitle')" :maskClosable="true">
      <template #footer>
        <a-button @click="showModal = false">{{ t('clipModalClose') }}</a-button>
      </template>
      <a-space direction="vertical">
        <a-typography-text strong>{{ t('clipModalFieldTitle') }}</a-typography-text>
        <a-typography-text>{{ selectedClip?.title || t('clipNoTitle') }}</a-typography-text>
        <a-typography-text strong>{{ t('clipModalFieldUrl') }}</a-typography-text>
        <a-typography-text>{{ selectedClip?.sourceUrl || t('clipNoUrl') }}</a-typography-text>
        <a-typography-text strong>{{ t('clipModalFieldContent') }}</a-typography-text>
        <div v-if="selectedClip && clipHasRichContent(selectedClip)" v-html="resolveClipHtml(selectedClip)"></div>
        <a-typography-text v-else-if="selectedClip">{{ selectedClip.textContent || t('clipNoContentAlt') }}</a-typography-text>
        <a-typography-text v-else>{{ t('clipNoContentAlt') }}</a-typography-text>
        <a-typography-text strong>{{ t('clipModalFieldCreatedAt') }}</a-typography-text>
        <a-typography-text>{{ selectedClipCreatedAt }}</a-typography-text>
      </a-space>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { formatClipDate, getClipPreview as formatClipPreview, getClipDomain } from '@/utils/clip-format';
import { useClipSearch } from '../composables/useClipSearch';
import { useClipPagination } from '../composables/useClipPagination';
import { useClipCRUD } from '../composables/useClipCRUD';
import { useBroadcastSync } from '@/composables/useBroadcastSync';
import type { SortBy } from '@/background/services/search-service';
import ClipToolbar from './clip/ClipToolbar.vue';
import ClipGroupedList from './clip/ClipGroupedList.vue';
import ClipTableView from './clip/ClipTableView.vue';

const { t } = useI18n();

type ClassificationMode = 'none' | 'domain' | 'date';
type ClipGroup = { key: string; label: string; clips: Clip[] };

// 使用组合式函数
const { searchQuery, searchResults, searchTotal, performSearch } = useClipSearch();
const { currentPage, paginatedClips: paginatedData } = useClipPagination(searchResults, 20);
const { deleteClip: deleteClipAction, openClip: openClipAction, openingId } = useClipCRUD();

// 使用BroadcastChannel同步
useBroadcastSync('clipsey-storage-sync', (message) => {
  // 数据变更时，跳转到第一页并刷新，确保新添加的内容可见
  if (message.type === 'CLIPS_CHANGED') {
    // 如果是新增内容（新数量大于旧数量），跳转到第一页
    if (message.newCount && message.oldCount && message.newCount > message.oldCount) {
      currentPage.value = 1;
    }
    void refreshClips(false);
  }
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
  return formatClipDate(selectedClip.value?.createdAt);
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
    title: t('clipTableColumnTitle'),
    dataIndex: 'title',
    key: 'title',
    width: 180,
    ellipsis: true
  },
  {
    title: t('clipTableColumnUrl'),
    dataIndex: 'sourceUrl',
    key: 'sourceUrl',
    width: 200
  },
  {
    title: t('clipTableColumnContent'),
    dataIndex: 'textContent',
    key: 'textContent',
    ellipsis: true
  },
  {
    title: t('clipTableColumnCreatedAt'),
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180
  },
  {
    title: t('clipTableColumnActions'),
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
    const domain = getDomainFromUrl(clip.sourceUrl) || t('clipNoUrl');
    return { key: `domain:${domain}`, label: domain };
  }
  const label = formatGroupDate(clip.createdAt);
  return { key: `date:${label}`, label };
}

function formatGroupDate(isoString: string | undefined): string {
  if (!isoString) return t('clipUnknownDate');
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return t('clipUnknownDate');
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const getClipPreview = (clip: Clip) => formatClipPreview(clip);
const getDomainFromUrl = (url?: string) => getClipDomain(url);

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
    message.success(t('clipRefreshed'));
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
  return formatClipDate(value);
}
</script>
