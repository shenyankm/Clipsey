<template>
  <div class="clip-manager tab-section">
    <a-typography-title :level="5">{{ t('menuContent') }}</a-typography-title>
    <a-typography-text type="secondary">
      {{ t('clipManagerDescription') }}
    </a-typography-text>
    <a-divider />
    <a-space direction="vertical" size="large" style="width: 100%;">
      <div class="clip-toolbar">
        <div class="clip-toolbar__row">
          <div class="clip-toolbar__search">
            <a-input-search
              v-model:value="searchQuery"
              :placeholder="searchPlaceholder"
              allow-clear
              enter-button
            >
              <template #addonBefore>
                <a-tooltip placement="bottom">
                  <template #title>
                    <div style="text-align: left;">
                      <div>{{ t('clipSearchOptionTitle') }}</div>
                      <div>{{ t('clipSearchOptionWebsite') }}</div>
                      <div>{{ t('clipSearchOptionContent') }}</div>
                    </div>
                  </template>
                  <span style="cursor: help;">🔍</span>
                </a-tooltip>
              </template>
            </a-input-search>
          </div>
          <div class="clip-toolbar__actions">
            <div class="clip-toolbar__stat">
              <div class="clip-toolbar__stat-value">{{ searchTotal }}</div>
              <div class="clip-toolbar__stat-label">{{ t('clipTotalCount') }}</div>
            </div>
            <a-button size="small" type="default" @click="refreshClips">
              {{ t('clipRefreshButton') }}
            </a-button>
          </div>
        </div>
        <div class="clip-toolbar__row clip-toolbar__row--filters">
          <span class="clip-toolbar__filter-label">{{ t('clipClassificationLabel') }}</span>
          <a-radio-group
            v-model:value="classificationMode"
            button-style="solid"
            size="small"
            class="clip-toolbar__classification"
          >
            <a-radio-button value="none">{{ t('clipClassificationNone') }}</a-radio-button>
            <a-radio-button value="timeline">{{ t('clipClassificationTimeline') }}</a-radio-button>
          </a-radio-group>
        </div>
      </div>

      <a-card v-if="searchTotal === 0" size="small">
        <a-empty :description="t('clipNoRecords')" />
        <a-space>
          <a-button size="small" @click="refreshClips">{{ t('clipRefreshButton') }}</a-button>
        </a-space>
      </a-card>

      <template v-else>
        <div v-if="isTimelineView" class="clip-timeline-container">
          <div class="clip-timeline-wrapper">
            <div class="timeline-axis"></div>
            <div v-for="group in timelineGroups" :key="group.date" class="timeline-date-group">
              <!-- 日期分割线 -->
              <div class="timeline-date-marker">
                <div class="timeline-date-dot"></div>
                <div class="timeline-date-label">{{ group.dateLabel }}</div>
              </div>
              
              <!-- 该日期的所有卡片 -->
              <div 
                v-for="clip in group.clips" 
                :key="clip.id"
                class="timeline-clip-wrapper"
                :class="{
                  'timeline-clip-wrapper--left': group.dayIndex % 2 === 0,
                  'timeline-clip-wrapper--right': group.dayIndex % 2 === 1
                }"
              >
                <div class="timeline-clip-card">
                  <div class="clip-card-header">
                    <h4 class="clip-card-title">{{ clip.title || t('clipNoTitle') }}</h4>
                    <span class="clip-card-time">{{ formatTimelineTime(clip.createdAt) }}</span>
                  </div>
                  <p class="clip-card-content">{{ getClipPreview(clip) }}</p>
                  <div class="clip-card-meta">
                    <a-tag v-if="clip.sourceUrl" size="small" :color="getSourceColor(clip.sourceUrl)">
                      {{ getDomainFromUrl(clip.sourceUrl) || t('clipNoUrl') }}
                    </a-tag>
                  </div>
                  <div class="clip-card-actions">
                    <a-button size="small" type="text" @click="openClipDetail(clip)">
                      {{ t('clipViewButton') }}
                    </a-button>
                    <a-button
                      size="small"
                      type="primary"
                      :disabled="!clip.sourceUrl"
                      :loading="openingId === clip.id"
                      @click="openClipAction(clip)"
                    >
                      {{ t('clipOpenButton') }}
                    </a-button>
                    <a-popconfirm :title="t('clipDeleteConfirm')" @confirm="deleteClip(clip.id)">
                      <a-button size="small" danger type="text">{{ t('clipDeleteButton') }}</a-button>
                    </a-popconfirm>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <a-card class="clip-table-card" size="small" bordered>
            <a-table
              :columns="columns"
              :dataSource="searchResults"
              :pagination="false"
              :bordered="false"
              :rowKey="rowKey"
              size="small"
              :loading="isSearching"
              @change="handleTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'sourceUrl'">
                  <template v-if="record.sourceUrl">
                    <a-tag color="blue">{{ getDomainFromUrl(record.sourceUrl) }}</a-tag>
                  </template>
                  <template v-else>{{ t('clipNoUrl') }}</template>
                </template>
                <template v-else-if="column.key === 'createdAt'">
                  {{ formatDateDisplay(record.createdAt) }}
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-space :size="8" align="center">
                    <a-button size="small" @click="openClipDetail(record)">
                      {{ t('clipViewButton') }}
                    </a-button>
                    <a-button
                      size="small"
                      type="primary"
                      :disabled="!record.sourceUrl"
                      :loading="openingId === record.id"
                      @click="openClipAction(record)"
                    >
                      {{ t('clipOpenButton') }}
                    </a-button>
                    <a-popconfirm :title="t('clipDeleteConfirm')" @confirm="deleteClip(record.id)">
                      <a-button size="small" danger>{{ t('clipDeleteButton') }}</a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </div>
        <div v-if="pageCount > 1" class="clip-pagination">
          <a-pagination
            v-model:current="currentPage"
            :total="searchTotal"
            :pageSize="pageSize"
            size="small"
            showLessItems
          />
        </div>
      </template>

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
          <a-typography-text v-else-if="selectedClip">
            {{ selectedClip.textContent || t('clipNoContentAlt') }}
          </a-typography-text>
          <a-typography-text v-else>{{ t('clipNoContentAlt') }}</a-typography-text>
          <a-typography-text strong>{{ t('clipModalFieldCreatedAt') }}</a-typography-text>
          <a-typography-text>{{ selectedClipCreatedAt }}</a-typography-text>
        </a-space>
      </a-modal>
    </a-space>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { formatClipDate, getClipPreview as formatClipPreview, getClipDomain } from '@/utils/clip-format';
import { useClipSearch } from '../composables/useClipSearch';
import { useClipCRUD } from '../composables/useClipCRUD';
import { useBroadcastSync } from '@/composables/useBroadcastSync';
import type { SortBy } from '@/background/services/search-service';
import { parseSearchQuery } from '@/utils/search/query-parser';

const { t } = useI18n();

 type ClassificationMode = 'none' | 'timeline';

const { searchQuery, searchResults, searchTotal, isSearching, performSearch } = useClipSearch();
const currentPage = ref(1);
const { deleteClip: deleteClipAction, openClip: openClipAction, openingId } = useClipCRUD();

useBroadcastSync('clipsey-storage-sync', (message) => {
  if (message.type === 'CLIPS_CHANGED') {
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

// 动态计算搜索框占位符
const searchPlaceholder = computed(() => {
  const trimmed = searchQuery.value.trim();
  if (!trimmed) {
    return t('clipSearchPlaceholder');
  }
  
  const parsed = parseSearchQuery(trimmed);
  if (parsed.type === 'title') {
    return t('clipSearchPlaceholder') + ' (@title)';
  } else if (parsed.type === 'website') {
    return t('clipSearchPlaceholder') + ' (@website)';
  } else if (parsed.type === 'content') {
    return t('clipSearchPlaceholder') + ' (@content)';
  }
  return t('clipSearchPlaceholder');
});

const selectedClipCreatedAt = computed(() => {
  return formatClipDate(selectedClip.value?.createdAt);
});

const isTimelineView = computed(() => classificationMode.value === 'timeline');

// 按日期分组clips
type ClipsByDate = {
  date: string; // YYYY-MM-DD 格式
  dateLabel: string; // 显示标签
  clips: Clip[];
  dayIndex: number; // 用于确定左右位置
};

const timelineGroups = computed<ClipsByDate[]>(() => {
  if (!isTimelineView.value || searchResults.value.length === 0) {
    return [];
  }

  // 按日期分组
  const groupMap = new Map<string, Clip[]>();
  const dateList: string[] = [];

  for (const clip of searchResults.value) {
    const date = getDateOnly(clip.createdAt);
    if (!groupMap.has(date)) {
      groupMap.set(date, []);
      dateList.push(date);
    }
    groupMap.get(date)!.push(clip);
  }

  // 按日期排序（最新的在前）
  dateList.sort((a, b) => b.localeCompare(a));

  // 计算每个日期的dayIndex（用于左右交替）
  return dateList.map((date, index) => ({
    date,
    dateLabel: formatTimelineDate(date),
    clips: groupMap.get(date) || [],
    dayIndex: index
  }));
});

// 获取日期部分（YYYY-MM-DD）
function getDateOnly(isoString?: string): string {
  if (!isoString) return 'unknown';
  try {
    return isoString.split('T')[0];
  } catch {
    return 'unknown';
  }
}



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

watch(searchTotal, () => {
  const maxPage = Math.max(1, pageCount.value);
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

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

function resolveClipHtml(clip: Clip): string {
  return getClipHtmlContent(clip);
}

function clipHasRichContent(clip: Clip): boolean {
  return hasClipRichContent(clip);
}


const getClipPreview = (clip: Clip) => formatClipPreview(clip);
const getDomainFromUrl = (url?: string) => getClipDomain(url);

watch(searchQuery, () => {
  resetPageAndSearch();
});

watch([sortColumn, sortOrder], () => {
  resetPageAndSearch();
});

watch(currentPage, () => {
  void performSearch(currentPage.value, pageSize, getSortOptions());
});

async function refreshClips(showMessage = true) {
  await performSearch(currentPage.value, pageSize, getSortOptions());
  if (showMessage) {
    message.success(t('clipRefreshed'));
  }
}

async function deleteClip(id: string) {
  const success = await deleteClipAction(id);
  if (success) {
    await performSearch(currentPage.value, pageSize, getSortOptions());
  }
}

function openClipDetail(clip: Clip) {
  selectedClip.value = clip;
  showModal.value = true;
}

onMounted(() => {
  void performSearch(currentPage.value, pageSize, getSortOptions());
});

const rowKey = (record: Clip) => record.id;

function formatDateDisplay(value?: string): string {
  return formatClipDate(value);
}

function formatTimelineDate(isoString?: string): string {
  if (!isoString) return t('clipUnknownDate') || 'Unknown Date';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return t('clipUnknownDate') || 'Unknown Date';
  
  const locale = (t('languageZhCN') === '简体中文') ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(locale, { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'short'
  });
}

function formatTimelineTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  
  const locale = (t('languageZhCN') === '简体中文') ? 'zh-CN' : 'en-US';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function getSourceColor(url?: string): string {
  if (!url) return 'default';
  const domain = getDomainFromUrl(url);
  if (!domain) return 'default';
  
  const hash = domain.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  const colors = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'geekblue', 'red', 'volcano', 'gold'];
  return colors[Math.abs(hash) % colors.length];
}
</script>

<style scoped>
.clip-manager {
  width: 100%;
}

.tab-section {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
}

/* 工具栏容器 - 移除卡片样式 */
.clip-toolbar {
  width: 100%;
}

.clip-toolbar__row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.clip-toolbar__row + .clip-toolbar__row {
  margin-top: 16px;
}

.clip-toolbar__row--filters {
  justify-content: space-between;
  border-top: 1px solid #f0f0f0;
  padding-top: 16px;
  align-items: center;
}

/* 搜索框 - 增大宽度 */
.clip-toolbar__search {
  flex: 1;
  min-width: 320px;
  max-width: 800px;
}

/* 右侧操作区 - 向右对齐 */
.clip-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
  margin-left: auto;
}

/* 刷新按钮样式优化 */
.clip-toolbar__actions :deep(.ant-btn) {
  height: 32px;
  padding: 4px 15px;
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.clip-toolbar__actions :deep(.ant-btn-default) {
  border: 1px solid #d9d9d9;
  background-color: #ffffff;
  color: rgba(0, 0, 0, 0.88);
}

.clip-toolbar__actions :deep(.ant-btn-default:hover) {
  color: #4096ff;
  border-color: #4096ff;
}

.clip-toolbar__actions :deep(.ant-btn-default:active) {
  color: #0958d9;
  border-color: #0958d9;
}

.clip-toolbar__stat {
  text-align: right;
  min-width: 90px;
  padding: 4px 12px;
  border-radius: 6px;
  background-color: #f5f5f5;
  transition: background-color 0.3s ease;
}

.clip-toolbar__stat:hover {
  background-color: #e6f4ff;
}

.clip-toolbar__stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  color: #1677ff;
  font-variant-numeric: tabular-nums;
}

.clip-toolbar__stat-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 2px;
}

.clip-toolbar__filter-label {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.88);
  white-space: nowrap;
}

.clip-toolbar__classification {
  display: flex;
  flex: 1;
  min-width: 220px;
  justify-content: flex-end;
}

/* 分类选择器样式优化 */
.clip-toolbar__classification :deep(.ant-radio-button-wrapper) {
  height: 32px;
  line-height: 30px;
  font-size: 14px;
  border-radius: 0;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.clip-toolbar__classification :deep(.ant-radio-button-wrapper:first-child) {
  border-radius: 6px 0 0 6px;
}

.clip-toolbar__classification :deep(.ant-radio-button-wrapper:last-child) {
  border-radius: 0 6px 6px 0;
}

.clip-toolbar__classification :deep(.ant-radio-button-wrapper-checked) {
  background-color: #1677ff;
  border-color: #1677ff;
}

.clip-toolbar__classification :deep(.ant-radio-button-wrapper:not(.ant-radio-button-wrapper-disabled):hover) {
  color: #4096ff;
}

.clip-table-card {
  margin-top: 8px;
  border-radius: 8px;
  border: 1px solid #d9d9d9;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
}

/* 时间轴容器 */
.clip-timeline-container {
  margin-top: 16px;
  width: 100%;
}

.clip-timeline-wrapper {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 0;
}

/* 中心轴线 */
.timeline-axis {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(to bottom, #e3e8ef 0%, #1677ff 50%, #e3e8ef 100%);
  transform: translateX(-50%);
  border-radius: 2px;
}

/* 日期分组 */
.timeline-date-group {
  position: relative;
  margin-bottom: 24px;
}

/* 日期标记 */
.timeline-date-marker {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  z-index: 2;
}

.timeline-date-dot {
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(22, 119, 255, 0.1);
}

.timeline-date-label {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 24px;
  padding: 6px 16px;
  background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  color: white;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.25);
}

/* 卡片包装器 */
.timeline-clip-wrapper {
  position: relative;
  margin-bottom: 16px;
  display: flex;
}

.timeline-clip-wrapper--left {
  justify-content: flex-end;
  padding-right: calc(50% + 24px);
}

.timeline-clip-wrapper--right {
  justify-content: flex-start;
  padding-left: calc(50% + 24px);
}

/* 卡片样式 */
.timeline-clip-card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border: 1px solid #e3e8ef;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.timeline-clip-wrapper--left .timeline-clip-card::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 20px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 8px solid #fff;
  filter: drop-shadow(2px 0 2px rgba(0, 0, 0, 0.04));
}

.timeline-clip-wrapper--right .timeline-clip-card::after {
  content: '';
  position: absolute;
  left: -8px;
  top: 20px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid #fff;
  filter: drop-shadow(-2px 0 2px rgba(0, 0, 0, 0.04));
}

.timeline-clip-card:hover {
  border-color: #4096ff;
  box-shadow: 0 4px 16px rgba(64, 150, 255, 0.15);
  transform: translateY(-2px);
}

/* 卡片头部 */
.clip-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.clip-card-title {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #262626;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.clip-card-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #8c8c8c;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
}

/* 卡片内容 */
.clip-card-content {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #595959;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* 卡片元信息 */
.clip-card-meta {
  margin-bottom: 12px;
}

/* 卡片操作 */
.clip-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.clip-card-actions .ant-btn {
  flex: 1;
}

/* 响应式 */
@media (max-width: 768px) {
  .timeline-clip-wrapper--left,
  .timeline-clip-wrapper--right {
    padding-left: 24px;
    padding-right: 24px;
    justify-content: center;
  }
  
  .timeline-axis {
    left: 24px;
  }
  
  .timeline-date-marker {
    justify-content: flex-start;
    padding-left: 16px;
  }
  
  .timeline-date-label {
    left: 40px;
    transform: none;
  }
  
  .timeline-clip-card::after {
    display: none;
  }
}

.clip-pagination {
  display: flex;
  justify-content: center;
}

@media (max-width: 768px) {
  .clip-toolbar__actions {
    width: 100%;
    justify-content: space-between;
  }

  .clip-toolbar__classification {
    justify-content: flex-start;
  }

  .clip-timeline {
    max-height: none;
  }
}
</style>


