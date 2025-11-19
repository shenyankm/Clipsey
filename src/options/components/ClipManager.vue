<template>
  <div class="clip-manager">
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
        <div v-if="isTimelineView">
          <a-card class="clip-timeline-card" size="small" bordered>
            <div class="clip-timeline">
              <a-timeline mode="left">
                <a-timeline-item 
                  v-for="(clipItem, index) in searchResults" 
                  :key="clipItem.id" 
                  class="clip-timeline-item"
                  :color="getTimelineColor(index)"
                >
                  <template #dot>
                    <div class="timeline-dot" :class="`timeline-dot--${getTimelineColorClass(index)}`">
                      <span class="timeline-dot__index">{{ searchResults.length - index }}</span>
                    </div>
                  </template>
                  <div class="timeline-card">
                    <div class="timeline-card__timestamp">
                      <span class="timeline-card__date">{{ formatTimelineDate(clipItem.createdAt) }}</span>
                      <span class="timeline-card__time-detail">{{ formatTimelineTime(clipItem.createdAt) }}</span>
                    </div>
                    <div class="timeline-card__main">
                      <div class="timeline-card__header">
                        <h4 class="timeline-card__title">{{ clipItem.title || t('clipNoTitle') }}</h4>
                        <a-tag :color="getSourceColor(clipItem.sourceUrl)" class="timeline-card__source-tag">
                          {{ getDomainFromUrl(clipItem.sourceUrl) || t('clipNoUrl') }}
                        </a-tag>
                      </div>
                      <div class="timeline-card__content">
                        <p class="timeline-card__excerpt">{{ getClipPreview(clipItem) }}</p>
                      </div>
                      <div class="timeline-card__footer">
                        <div class="timeline-card__url">
                          <template v-if="clipItem.sourceUrl">
                            <svg class="timeline-card__link-icon" viewBox="0 0 1024 1024" width="12" height="12">
                              <path d="M853.333333 469.333333a42.666667 42.666667 0 0 0-42.666666 42.666667v256a42.666667 42.666667 0 0 1-42.666667 42.666667H256a42.666667 42.666667 0 0 1-42.666667-42.666667V256a42.666667 42.666667 0 0 1 42.666667-42.666667h256a42.666667 42.666667 0 0 0 0-85.333333H256a128 128 0 0 0-128 128v512a128 128 0 0 0 128 128h512a128 128 0 0 0 128-128v-256a42.666667 42.666667 0 0 0-42.666667-42.666667z" fill="currentColor"/>
                              <path d="M682.666667 213.333333h67.413333l-268.373333 268.373334a42.666667 42.666667 0 0 0 60.586666 60.586666L810.666667 273.92V341.333333a42.666667 42.666667 0 0 0 85.333333 0V170.666667a42.666667 42.666667 0 0 0-42.666667-42.666667h-170.666666a42.666667 42.666667 0 0 0 0 85.333333z" fill="currentColor"/>
                            </svg>
                            <a :href="clipItem.sourceUrl" target="_blank" rel="noreferrer" class="timeline-card__link">{{ clipItem.sourceUrl }}</a>
                          </template>
                          <template v-else>
                            <span class="timeline-card__no-url">{{ t('clipNoUrlAlt') }}</span>
                          </template>
                        </div>
                        <div class="timeline-card__actions">
                          <a-button size="small" type="text" @click="openClipDetail(clipItem)">
                            {{ t('clipViewButton') }}
                          </a-button>
                          <a-button
                            size="small"
                            type="primary"
                            :disabled="!clipItem.sourceUrl"
                            :loading="openingId === clipItem.id"
                            @click="openClipAction(clipItem)"
                          >
                            {{ t('clipOpenButton') }}
                          </a-button>
                          <a-popconfirm :title="t('clipDeleteConfirm')" @confirm="deleteClip(clipItem.id)">
                            <a-button size="small" danger type="text">{{ t('clipDeleteButton') }}</a-button>
                          </a-popconfirm>
                        </div>
                      </div>
                    </div>
                  </div>
                </a-timeline-item>
              </a-timeline>
            </div>
          </a-card>
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
  if (!isoString) return t('clipUnknownDate');
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return t('clipUnknownDate');
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimelineTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getTimelineColor(index: number): string {
  const colors = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta'];
  return colors[index % colors.length];
}

function getTimelineColorClass(index: number): string {
  const classes = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta'];
  return classes[index % classes.length];
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

.clip-timeline-card {
  margin-top: 8px;
  border-radius: 8px;
  border: 1px solid #d9d9d9;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
  background: linear-gradient(to bottom, #fafafa 0%, #ffffff 100%);
}

.clip-timeline {
  max-height: 75vh;
  overflow-y: auto;
  padding: 16px 8px 16px 0;
}

.clip-timeline::-webkit-scrollbar {
  width: 6px;
}

.clip-timeline::-webkit-scrollbar-track {
  background: #f0f0f0;
  border-radius: 3px;
}

.clip-timeline::-webkit-scrollbar-thumb {
  background: #bfbfbf;
  border-radius: 3px;
}

.clip-timeline::-webkit-scrollbar-thumb:hover {
  background: #8c8c8c;
}

.clip-timeline-item {
  animation: slideInFromLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.clip-timeline-item:hover .timeline-card {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.timeline-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  z-index: 2;
}

.timeline-dot:hover {
  transform: scale(1.15) rotate(5deg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.timeline-dot--blue {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
}

.timeline-dot--green {
  background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
}

.timeline-dot--orange {
  background: linear-gradient(135deg, #fa8c16 0%, #d46b08 100%);
}

.timeline-dot--purple {
  background: linear-gradient(135deg, #722ed1 0%, #531dab 100%);
}

.timeline-dot--cyan {
  background: linear-gradient(135deg, #13c2c2 0%, #08979c 100%);
}

.timeline-dot--magenta {
  background: linear-gradient(135deg, #eb2f96 0%, #c41d7f 100%);
}

.timeline-dot__index {
  font-variant-numeric: tabular-nums;
}

.timeline-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e8e8e8;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.timeline-card::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 16px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid #e8e8e8;
}

.timeline-card::after {
  content: '';
  position: absolute;
  left: -7px;
  top: 16px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid white;
}

.timeline-card__timestamp {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f0f0f0;
}

.timeline-card__date {
  font-size: 15px;
  font-weight: 600;
  color: #262626;
  letter-spacing: 0.3px;
}

.timeline-card__time-detail {
  font-size: 12px;
  color: #8c8c8c;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
}

.timeline-card__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.timeline-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #262626;
  line-height: 1.5;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-card__source-tag {
  flex-shrink: 0;
  font-size: 12px;
  border-radius: 4px;
  padding: 0 10px;
  font-weight: 500;
}

.timeline-card__content {
  margin: 0;
}

.timeline-card__excerpt {
  margin: 0;
  font-size: 14px;
  color: #595959;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #f5f5f5;
  flex-wrap: wrap;
}

.timeline-card__url {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8c8c8c;
}

.timeline-card__link-icon {
  flex-shrink: 0;
  color: #1677ff;
}

.timeline-card__link {
  color: #1677ff;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.3s ease;
}

.timeline-card__link:hover {
  color: #4096ff;
  text-decoration: underline;
}

.timeline-card__no-url {
  color: #bfbfbf;
  font-style: italic;
}

.timeline-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInFromLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
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


