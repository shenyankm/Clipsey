<template>
  <div class="clip-manager">
    <a-space direction="vertical" size="large" style="width: 100%;">
      <a-card class="clip-toolbar-card" size="small" bordered>
        <div class="clip-toolbar__row">
          <div class="clip-toolbar__search">
            <a-mentions
              v-model:value="searchQuery"
              :prefix="['@']"
              :placeholder="t('clipSearchPlaceholder')"
            >
              <a-mentions-option value="title">{{ t('clipSearchOptionTitle') }}</a-mentions-option>
              <a-mentions-option value="website">{{ t('clipSearchOptionWebsite') }}</a-mentions-option>
              <a-mentions-option value="content">{{ t('clipSearchOptionContent') }}</a-mentions-option>
            </a-mentions>
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
            <a-radio-button value="domain">{{ t('clipClassificationDomain') }}</a-radio-button>
            <a-radio-button value="date">{{ t('clipClassificationDate') }}</a-radio-button>
          </a-radio-group>
        </div>
      </a-card>

      <a-card v-if="searchTotal === 0" size="small">
        <a-empty :description="t('clipNoRecords')" />
        <a-space>
          <a-button size="small" @click="refreshClips">{{ t('clipRefreshButton') }}</a-button>
        </a-space>
      </a-card>

      <template v-else>
        <div v-if="isGroupedView" class="clip-group-area">
          <div v-if="!groupedClips.length" class="clip-group-empty">
            <a-empty :description="t('clipGroupEmpty')" />
          </div>
          <div v-else class="clip-group-list">
            <a-card
              v-for="group in groupedClips"
              :key="group.key"
              size="small"
              :class="['clip-group-card', { 'clip-group-card--collapsed': !isGroupExpanded(group.key) }]"
            >
              <template #title>
                <div class="clip-group-card__header">
                  <span class="clip-group-card__title">{{ group.label }}</span>
                  <span class="clip-group-card__count">({{ group.clips.length }})</span>
                </div>
              </template>
              <template #extra>
                <a-button type="link" size="small" @click="toggleGroupExpansion(group.key)">
                  {{ isGroupExpanded(group.key) ? t('clipGroupCollapse') : t('clipGroupExpand') }}
                </a-button>
              </template>
              <div v-if="isGroupExpanded(group.key)">
                <div
                  v-for="clipItem in group.clips"
                  :key="clipItem.id"
                  class="clip-group-item"
                >
                  <div class="clip-group-item__content">
                    <div class="clip-group-item__header">
                      <div class="clip-group-item__title">
                        {{ clipItem.title || t('clipNoTitle') }}
                      </div>
                      <div class="clip-group-item__tags">
                        <span class="clip-badge" v-if="clipItem.sourceUrl && !isDomainClassification">
                          {{ getDomainFromUrl(clipItem.sourceUrl) || t('clipNoUrl') }}
                        </span>
                        <span class="clip-badge clip-badge--muted" v-if="clipItem.createdAt">
                          {{ formatDateDisplay(clipItem.createdAt) }}
                        </span>
                      </div>
                    </div>
                    <div class="clip-group-item__excerpt">{{ getClipPreview(clipItem) }}</div>
                    <div class="clip-group-item__meta-row" v-if="isDomainClassification">
                      <div class="clip-group-item__url">
                        <template v-if="clipItem.sourceUrl">
                          <a :href="clipItem.sourceUrl" target="_blank" rel="noreferrer">
                            {{ clipItem.sourceUrl }}
                          </a>
                        </template>
                        <template v-else>{{ t('clipNoUrlAlt') }}</template>
                      </div>
                    </div>
                    <div class="clip-group-item__meta-row" v-else>
                      <div class="clip-group-item__meta">
                        <span>{{ formatDateDisplay(clipItem.createdAt) }}</span>
                        <span v-if="clipItem.sourceUrl">
                          {{ t('clipFromSource') }}
                          {{ getDomainFromUrl(clipItem.sourceUrl) || t('clipNoUrl') }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="clip-group-item__actions">
                    <a-button size="small" @click="openClipDetail(clipItem)">
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
                      <a-button size="small" danger>{{ t('clipDeleteButton') }}</a-button>
                    </a-popconfirm>
                  </div>
                </div>
              </div>
            </a-card>
          </div>
        </div>
        <div v-else>
          <a-card class="clip-table-card" size="small" bordered>
            <a-table
              :columns="columns"
              :dataSource="paginatedData"
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
import { useClipPagination } from '../composables/useClipPagination';
import { useClipCRUD } from '../composables/useClipCRUD';
import { useBroadcastSync } from '@/composables/useBroadcastSync';
import type { SortBy } from '@/background/services/search-service';

const { t } = useI18n();

type ClassificationMode = 'none' | 'domain' | 'date';
type ClipGroup = { key: string; label: string; clips: Clip[] };

const { searchQuery, searchResults, searchTotal, isSearching, performSearch } = useClipSearch();
const { currentPage, paginatedClips: paginatedData } = useClipPagination(searchResults, 20);
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
  console.log('[ClipManager] Component mounted');
  console.log('[ClipManager] Initial state:', {
    searchQuery: searchQuery.value,
    classificationMode: classificationMode.value,
    searchTotal: searchTotal.value
  });
  void performSearch(currentPage.value, pageSize, getSortOptions());
});

const rowKey = (record: Clip) => record.id;

function formatDateDisplay(value?: string): string {
  return formatClipDate(value);
}
</script>

<style scoped>
.clip-manager {
  width: 100%;
}

.clip-toolbar-card {
  border-radius: 12px;
}

.clip-toolbar__row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.clip-toolbar__row + .clip-toolbar__row {
  margin-top: 12px;
}

.clip-toolbar__row--filters {
  justify-content: space-between;
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}

.clip-toolbar__search {
  flex: 1;
  min-width: 240px;
}

.clip-toolbar__search :deep(.ant-mentions) {
  width: 100%;
}

.clip-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.clip-toolbar__stat {
  text-align: right;
  min-width: 90px;
}

.clip-toolbar__stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.clip-toolbar__stat-label {
  font-size: 12px;
  color: #8c8c8c;
}

.clip-toolbar__filter-label {
  font-size: 13px;
  color: #8c8c8c;
}

.clip-toolbar__classification {
  display: flex;
  flex: 1;
  min-width: 220px;
  justify-content: flex-end;
}

.clip-group-area {
  width: 100%;
}

.clip-group-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.clip-group-card {
  border-radius: 10px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
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
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #f5f5f5;
}

.clip-group-item:first-of-type {
  border-top: none;
}

.clip-group-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clip-group-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.clip-group-item__title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.clip-group-item__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.clip-badge {
  background-color: #f0f5ff;
  color: #1d39c4;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.clip-badge--muted {
  background-color: #f5f5f5;
  color: #595959;
}

.clip-group-item__excerpt {
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clip-group-item__meta-row {
  font-size: 12px;
  color: #8c8c8c;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.clip-group-item__meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
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

.clip-group-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.clip-group-empty {
  padding: 32px 0;
}

.clip-table-card {
  margin-top: 8px;
  border-radius: 12px;
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
}
</style>
