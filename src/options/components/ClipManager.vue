<template>
  <a-space direction="vertical" size="large" style="width: 100%;">
    <a-row :gutter="12" align="middle">
      <a-col :xs="24" :sm="18" :md="20" :lg="20">
        <a-mentions
          v-model:value="searchQuery"
          placeholder="输入 @title、@website、@content 进行精确搜索,或直接输入关键词进行全文搜索..."
          style="width: 100%;"
        >
          <a-mentions-option value="title">@title - 搜索标题</a-mentions-option>
          <a-mentions-option value="website">@website - 搜索网站</a-mentions-option>
          <a-mentions-option value="content">@content - 搜索内容</a-mentions-option>
        </a-mentions>
      </a-col>
      <a-col :xs="24" :sm="6" :md="4" :lg="4">
        <a-button type="link" size="small" style="width: 100%;" @click="refreshClips">刷新</a-button>
      </a-col>
    </a-row>

    <div class="clip-manager__classification">
      <span class="clip-manager__classification-label">分类视图：</span>
      <a-radio-group
        v-model:value="classificationMode"
        button-style="solid"
        size="small"
        class="clip-manager__classification-group"
      >
        <a-radio-button value="none">不分类</a-radio-button>
        <a-radio-button value="domain">按网址分类</a-radio-button>
        <a-radio-button value="date">按日期分类</a-radio-button>
      </a-radio-group>
    </div>

    <div>
      <a-card v-if="searchTotal === 0" size="small">
        <a-empty description="暂无摘抄记录" />
        <a-space>
          <a-button size="small" @click="refreshClips">刷新</a-button>
        </a-space>
      </a-card>

      <div v-else>
        <template v-if="isGroupedView">
          <div v-if="!groupedClips.length" class="clip-group-empty">
            <a-empty description="当前视图暂无数据" />
          </div>
          <div v-else class="clip-group-list">
            <a-card
              v-for="group in groupedClips"
              :key="group.key"
              size="small"
              :class="[
                'clip-group-card',
                { 'clip-group-card--collapsed': !isGroupExpanded(group.key) }
              ]"
            >
              <template #title>
                <div class="clip-group-card__header">
                  <span class="clip-group-card__title">{{ group.label }}</span>
                  <span class="clip-group-card__count">({{ group.clips.length }})</span>
                </div>
              </template>
              <template #extra>
                <a-button type="link" size="small" @click="toggleGroupExpansion(group.key)">
                  {{ isGroupExpanded(group.key) ? '收起' : '展开' }}
                </a-button>
              </template>
              <div v-if="isGroupExpanded(group.key)">
                <div
                  v-for="clipItem in group.clips"
                  :key="clipItem.id"
                  :class="[
                    'clip-group-item',
                    {
                      'clip-group-item--date': isDateClassification,
                      'clip-group-item--domain': isDomainClassification
                    }
                  ]"
                >
                  <div class="clip-group-item__content">
                    <div class="clip-group-item__title">{{ clipItem.title || '无标题' }}</div>
                    <template v-if="isDateClassification">
                      <div class="clip-group-item__excerpt">{{ getClipPreview(clipItem) }}</div>
                      <div class="clip-group-item__time">{{ formatTimeForGroup(clipItem.createdAt) }}</div>
                    </template>
                    <template v-else-if="isDomainClassification">
                      <div class="clip-group-item__url">
                        <template v-if="clipItem.sourceUrl">
                          <a :href="clipItem.sourceUrl" target="_blank" rel="noreferrer">
                            {{ formatUrlForDisplay(clipItem.sourceUrl) }}
                          </a>
                        </template>
                        <template v-else>暂无网址</template>
                      </div>
                      <div class="clip-group-item__meta clip-group-item__meta--domain">
                        <span>{{ formatDateForTable(clipItem.createdAt) }}</span>
                      </div>
                      <div class="clip-group-item__excerpt">{{ getClipPreview(clipItem) }}</div>
                    </template>
                    <template v-else>
                      <div class="clip-group-item__meta">
                        <span>{{ formatDateForTable(clipItem.createdAt) }}</span>
                        <span v-if="clipItem.sourceUrl">
                          来自 {{ getDomainFromUrl(clipItem.sourceUrl) || '无网址' }}
                        </span>
                      </div>
                      <div class="clip-group-item__excerpt">{{ getClipPreview(clipItem) }}</div>
                    </template>
                  </div>
                  <div class="clip-group-item__actions">
                    <a-button size="small" @click="openClipDetail(clipItem)">查看</a-button>
                    <a-button
                      size="small"
                      type="primary"
                      :disabled="!clipItem.sourceUrl"
                      @click="openClipAction(clipItem.id)"
                    >
                      打开
                    </a-button>
                    <a-popconfirm title="确认删除该摘抄？此操作不可恢复" @confirm="deleteClip(clipItem.id)">
                      <a-button size="small" danger>删除</a-button>
                    </a-popconfirm>
                  </div>
                </div>
              </div>
            </a-card>
          </div>
        </template>
        <template v-else>
          <a-table
            :columns="columns"
            :dataSource="paginatedData"
            :pagination="false"
            :bordered="false"
            :rowKey="rowKey"
            size="small"
            @change="handleTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'sourceUrl'">
                <template v-if="record.sourceUrl">
                  <a-tag color="blue">{{ getDomainFromUrl(record.sourceUrl) }}</a-tag>
                </template>
                <template v-else>无网址</template>
              </template>
              <template v-else-if="column.key === 'createdAt'">
                {{ formatDateForTable(record.createdAt) }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-space :size="8" align="center">
                  <a-button size="small" @click="openClipDetail(record)">查看</a-button>
                  <a-button
                    size="small"
                    type="primary"
                    :disabled="!record.sourceUrl"
                    @click="openClipAction(record.id)"
                  >
                    打开
                  </a-button>
                  <a-popconfirm title="确认删除该摘抄？此操作不可恢复" @confirm="deleteClip(record.id)">
                    <a-button size="small" danger>删除</a-button>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
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


function formatTimeForGroup(isoString: string | undefined): string {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getClipPreview(clip: Clip): string {
  const content = clip.textContent ?? '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return clip.title?.trim() || '暂无内容';
  }
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

function formatUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const search = parsed.search ?? '';
    return `${parsed.hostname}${path}${search}`;
  } catch {
    return url;
  }
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
</script>

<style scoped>
.clip-manager__classification {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.clip-manager__classification-label {
  font-size: 13px;
  color: #8c8c8c;
}

.clip-manager__classification-group {
  flex: 1;
}

.clip-group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.clip-group-card {
  border-radius: 8px;
}

.clip-group-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 14px;
}

.clip-group-card__count {
  color: #8c8c8c;
  font-size: 12px;
}

.clip-group-item {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  border-top: 1px solid #f0f0f0;
}

.clip-group-item--date {
  align-items: flex-start;
}

.clip-group-item--date .clip-group-item__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clip-group-item--date .clip-group-item__excerpt {
  margin-top: 0;
}

.clip-group-item--domain .clip-group-item__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clip-group-item--domain .clip-group-item__excerpt {
  margin-top: 0;
}

.clip-group-item:first-of-type {
  border-top: none;
}

.clip-group-item__content {
  flex: 1;
  min-width: 0;
}

.clip-group-item__title {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 4px;
}

.clip-group-item__meta {
  font-size: 12px;
  color: #8c8c8c;
}

.clip-group-item__excerpt {
  font-size: 13px;
  color: #595959;
  line-height: 1.4;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clip-group-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.clip-group-item__time {
  font-size: 12px;
  color: #8c8c8c;
}

.clip-group-item__url {
  font-size: 12px;
  color: #8c8c8c;
  word-break: break-all;
}

.clip-group-item__url a {
  color: #1677ff;
  text-decoration: none;
}

.clip-group-item__url a:hover {
  text-decoration: underline;
}

.clip-group-empty {
  padding: 24px 0;
}
</style>
