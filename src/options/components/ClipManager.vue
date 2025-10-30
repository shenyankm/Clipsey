<template>
  <div class="clip-manager">

    <div class="clip-manager__main">
      <n-space vertical size="large">
        <div class="clip-manager__search">
          <n-mention
            v-model:value="searchQuery"
            :options="mentionOptions"
            placeholder="输入 @title、@website、@content 进行精确搜索，或直接输入关键词进行全文搜索..."
            clearable
            size="medium"
            class="clip-manager__search-input"
            :render-label="renderMentionLabel"
          />
          <n-button tertiary size="small" @click="refreshClips">
            刷新
          </n-button>
        </div>

        <div>
          <n-card v-if="filteredClips.length === 0" size="small" class="clip-manager__empty-card">
            <n-empty description="暂无摘抄记录">
              <template #extra>
                <n-button size="small" @click="refreshClips">
                  刷新
                </n-button>
              </template>
            </n-empty>
          </n-card>

          <div v-else>
            <n-data-table
              :columns="columns"
              :data="paginatedClips"
              :pagination="false"
              :bordered="false"
              :single-line="false"
              @update:sorter="handleSorterChange"
            />
          </div>

          <n-space v-if="pageCount > 1" justify="end">
            <n-pagination
              v-model:page="currentPage"
              :page-count="pageCount"
              :page-size="pageSize"
              size="small"
            />
          </n-space>
        </div>
      </n-space>
    </div>

    <n-modal v-model:show="showModal" preset="dialog" title="摘抄详情" :mask-closable="true">
      <template #default>
        <n-space vertical>
          <n-text strong>标题:</n-text>
          <n-text>{{ selectedClip?.title || '无标题' }}</n-text>
          <n-text strong>URL:</n-text>
          <n-text>{{ selectedClip?.sourceUrl || '无URL' }}</n-text>
          <n-text strong>内容:</n-text>
          <div v-if="selectedClip && clipHasRichContent(selectedClip)" v-html="resolveClipHtml(selectedClip)"></div>
          <n-text v-else-if="selectedClip">{{ selectedClip.textContent || '暂无内容' }}</n-text>
          <n-text v-else>暂无内容</n-text>
        </n-space>
      </template>
      <template #action>
        <n-button @click="showModal = false">关闭</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, h } from 'vue';
import {
  NSpace,
  NCard,
  NEmpty,
  NButton,
  NThing,
  NTag,
  NPagination,
  useMessage,
  NModal,
  NText,
  NDataTable,
  DataTableColumn,
  NMention,
  MentionOption
} from 'naive-ui';

import { getClips, deleteClipById } from '@/background/api';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { sendMessage } from '@/utils/chrome';
import { formatDateForTable } from '@/utils/helpers';

const PAGE_SIZE = 20;

const message = useMessage();
const searchQuery = ref('');

const currentPage = ref(1);
const clips = ref<Clip[]>([]);
const showModal = ref(false);
const selectedClip = ref<Clip | null>(null);

// 排序状态管理
const sortColumn = ref<string>('createdAt');
const sortOrder = ref<'asc' | 'desc'>('desc'); // 默认按最新时间排序

// 排序处理函数
function handleSorterChange(sorter: any) {
  if (sorter && sorter.columnKey) {
    sortColumn.value = sorter.columnKey;
    sortOrder.value = sorter.order === 'ascend' ? 'asc' : 'desc';
  }
}

// 新增：定义表格列
const columns = computed<DataTableColumn<Clip>[]>(() => [
  {
    title: '标题',
    key: 'title',
    width: 180,
    ellipsis: { tooltip: true }, // 新增：文本省略
    render(row: Clip) {
      return row.title || '无标题';
    }
  },
  {
    title: '网址',
    key: 'sourceUrl',
    width: 200,
    render(row: Clip) {
      return row.sourceUrl ? h(NTag, { type: 'info', size: 'small' }, { default: () => getDomainFromUrl(row.sourceUrl) }) : '无网址';
    }
  },
  {
    title: '内容',
    key: 'textContent',
    ellipsis: { tooltip: true }, // 新增：文本省略
    render(row: Clip) {
      return row.textContent || '暂无内容';
    }
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 180,
    sortOrder: sortColumn.value === 'createdAt' ? (sortOrder.value === 'asc' ? 'ascend' : 'descend') : false,
    sorter: true,
    render(row: Clip) {
      return formatDateForTable(row.createdAt);
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    align: 'center',
    render(row: Clip) {
      return h(
        'div',
        { style: { display: 'flex', justifyContent: 'center', gap: '8px' } },
        [
          h(
            NButton,
            { size: 'small', onClick: () => openClipDetail(row) },
            { default: () => '查看' }
          ),
          h(
            NButton,
            { 
              size: 'small', 
              type: 'primary',
              disabled: !row.sourceUrl,
              onClick: () => openClip(row.id)
            },
            { default: () => '打开' }
          ),
          h(
            NButton,
            { size: 'small', type: 'error', onClick: () => deleteClip(row.id) },
            { default: () => '删除' }
          )
        ]
      );
    }
  }
]);

// Mention 组件的选项配置
const mentionOptions: MentionOption[] = [
  {
    label: 'title - 搜索标题',
    value: 'title'
  },
  {
    label: 'website - 搜索网站',
    value: 'website'
  },
  {
    label: 'content - 搜索内容',
    value: 'content'
  }
];

// Mention 标签的渲染函数
function renderMentionLabel(option: MentionOption): string {
  return `@${option.value}`;
}

// 搜索查询解析接口
interface ParsedSearchQuery {
  type: 'all' | 'title' | 'website' | 'content';
  keyword: string;
}

// 解析搜索查询的函数
function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmedQuery = query.trim();
  
  if (!trimmedQuery) {
    return { type: 'all', keyword: '' };
  }
  
  // 检查是否以 @ 开头
  if (trimmedQuery.startsWith('@')) {
    const parts = trimmedQuery.split(' ');
    const typePrefix = parts[0].substring(1); // 移除 @
    const keyword = parts.slice(1).join(' ').trim();
    
    // 验证类型是否有效
    if (['title', 'website', 'content'].includes(typePrefix)) {
      // 只有当有具体关键词时才返回特定类型搜索
      if (keyword) {
        return {
          type: typePrefix as 'title' | 'website' | 'content',
          keyword
        };
      } else {
        // 仅有前缀没有关键词时，返回空搜索（不触发筛选）
        return {
          type: 'all',
          keyword: ''
        };
      }
    }
  }
  
  // 默认全文搜索
  return { type: 'all', keyword: trimmedQuery };
}

function resolveClipHtml(clip: Clip): string {
  return getClipHtmlContent(clip);
}

function clipHasRichContent(clip: Clip): boolean {
  return hasClipRichContent(clip);
}


function getDomainFromUrl(url: string | undefined): string {
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

const filteredClips = computed(() => {
  const parsedQuery = parseSearchQuery(searchQuery.value);
  
  let result = clips.value;

  // 应用搜索过滤
  if (parsedQuery.keyword) {
    const keyword = parsedQuery.keyword.toLowerCase();

    result = result.filter(clip => {
      const title = (clip.title ?? '').toLowerCase();
      const content = clip.textContent.toLowerCase();
      const url = (clip.sourceUrl ?? '').toLowerCase();

      switch (parsedQuery.type) {
        case 'title':
          return title.includes(keyword);
        case 'website':
          return url.includes(keyword);
        case 'content':
          return content.includes(keyword);
        default:
          // 全文搜索：搜索标题、内容和网址
          return (
            title.includes(keyword) ||
            url.includes(keyword) ||
            content.includes(keyword)
          );
      }
    });
  }

  // 应用排序
  return result.sort((a, b) => {
    let aValue: any, bValue: any;

    switch (sortColumn.value) {
      case 'createdAt':
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      case 'title':
        aValue = (a.title ?? '').toLowerCase();
        bValue = (b.title ?? '').toLowerCase();
        break;
      case 'sourceUrl':
        aValue = (a.sourceUrl ?? '').toLowerCase();
        bValue = (b.sourceUrl ?? '').toLowerCase();
        break;
      case 'textContent':
        aValue = a.textContent.toLowerCase();
        bValue = b.textContent.toLowerCase();
        break;
      default:
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
    }

    if (sortOrder.value === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });
});

const paginatedClips = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredClips.value.slice(start, start + PAGE_SIZE);
});

const pageCount = computed(() => {
  if (filteredClips.value.length === 0) {
    return 1;
  }
  return Math.ceil(filteredClips.value.length / PAGE_SIZE);
});

const pageSize = PAGE_SIZE;

watch(searchQuery, () => {
  currentPage.value = 1;
});

watch([sortColumn, sortOrder], () => {
  currentPage.value = 1;
});

watch(filteredClips, clipsList => {
  const maxPage = Math.max(1, Math.ceil(clipsList.length / PAGE_SIZE));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

async function fetchClips() {
  try {
    const fetchedClips = await getClips();
    clips.value = fetchedClips;
  } catch (error) {
    message.error(`加载摘抄列表失败: ${(error as Error).message}`);
  }
}

async function deleteClip(id: string) {
  try {
    await deleteClipById(id);
    message.success('摘抄已删除');
    await fetchClips();
  } catch (error) {
    message.error(`删除摘抄失败: ${(error as Error).message}`);
  }
}

function openClipDetail(clip: Clip) {
  selectedClip.value = clip;
  showModal.value = true;
}

function refreshClips() {
  fetchClips();
}

async function openClip(clipId: string): Promise<void> {
  try {
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'OPEN_CLIP',
      payload: { id: clipId }
    });
    if (!response?.success) {
      throw new Error(response?.error ?? '无法打开摘抄');
    }
    message.success('正在打开摘抄...');
  } catch (error) {
    message.error((error as Error).message || '无法打开摘抄');
  }
}

onMounted(() => {
  fetchClips();
});
</script>

<style scoped>
.clip-manager {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

.clip-manager__main {
  min-width: 0;
}

.clip-manager__search {
  display: flex;
  gap: 12px;
  align-items: center;
}

.clip-manager__search-input {
  flex: 1; /* 允许搜索框填充可用空间 */
  min-width: 300px; /* 增加最小宽度以容纳更长的提示文本 */
}

.clip-manager__empty-card {
  text-align: center;
}

/* 以下为表格展示后不再需要的样式 */
/*
.clip-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

.clip-card {
  height: 100%;
}

.clip-content {
  line-height: 1.6;
  word-break: break-word;
  max-height: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 8px;
  color: var(--n-text-color);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-clamp: 3;
}

.clip-content--empty {
  color: var(--n-text-color-3);
}

.clip-content :deep(.clipsey-inline-highlight) {
  background-color: rgba(251, 191, 36, 0.45);
  border-radius: 3px;
  padding: 0 2px;
}

@media (max-width: 1200px) {
    .clip-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 960px) {
    .clip-manager {
      grid-template-columns: 1fr;
    }

    

    .clip-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .clip-grid {
      grid-template-columns: 1fr;
    }

    .clip-manager__search {
      flex-direction: column;
      align-items: stretch;
    }

    .clip-manager__search-input {
      width: 100%;
      min-width: unset;
    }
  }
*/
.clip-card-title :deep(.n-thing-header__title) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>



