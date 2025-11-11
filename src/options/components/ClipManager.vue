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

    <div>
      <a-card v-if="searchTotal === 0" size="small">
        <a-empty description="暂无摘抄记录" />
        <a-space>
          <a-button size="small" @click="refreshClips">刷新</a-button>
        </a-space>
      </a-card>

      <div v-else>
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
                <a-button size="small" type="primary" :disabled="!record.sourceUrl" @click="openClipAction(record.id)">打开</a-button>
                <a-popconfirm title="确认删除该摘抄？此操作不可恢复。" @confirm="deleteClip(record.id)">
                  <a-button size="small" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
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

const selectedClipCreatedAt = computed(() => {
  const createdAt = selectedClip.value?.createdAt;
  return createdAt ? formatDateForTable(createdAt) : '未知';
});

type SortDirection = 'asc' | 'desc';
const DEFAULT_SORT_COLUMN: SortBy = 'createdAt';
const DEFAULT_SORT_ORDER: SortDirection = 'desc';
const SORTABLE_COLUMNS: SortBy[] = ['title', 'sourceUrl', 'textContent', 'createdAt'];

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
    width: 180,
    sorter: true,
    sortOrder: sortColumn.value === 'createdAt' ? (sortOrder.value === 'asc' ? 'ascend' : 'descend') : undefined
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



