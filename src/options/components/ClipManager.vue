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
        <a-button type="link" size="small" @click="refreshClips" style="width: 100%;">刷新</a-button>
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
          :dataSource="paginatedClips"
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
                <a-button size="small" type="primary" :disabled="!record.sourceUrl" @click="openClip(record.id)">打开</a-button>
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
      </a-space>
    </a-modal>
  </a-space>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { message } from 'ant-design-vue';

import { deleteClipById, searchClips } from '@/background/api';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { sendMessage } from '@/utils/chrome';
import { formatDateForTable } from '@/utils/helpers';

// BroadcastChannel 用于跨页面同步
let syncChannel: BroadcastChannel | null = null;

const PAGE_SIZE = 20;
const searchQuery = ref('');

const currentPage = ref(1);
const clips = ref<Clip[]>([]);
const paginatedClips = ref<Clip[]>([]);
const searchTotal = ref(0);
const showModal = ref(false);
const selectedClip = ref<Clip | null>(null);

// 排序状态管理
const sortColumn = ref<string>('createdAt');
const sortOrder = ref<'asc' | 'desc'>('desc'); // 默认按最新时间排序

// Table 变更处理（排序）
function handleTableChange(_pagination: any, _filters: any, sorter: any) {
  if (sorter && sorter.columnKey) {
    sortColumn.value = sorter.columnKey;
    sortOrder.value = sorter.order === 'ascend' ? 'asc' : 'desc';
  }
}

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

// 搜索查询解析接口
interface ParsedSearchQuery {
  type: 'all' | 'title' | 'website' | 'content';
  keyword: string;
}

// 解析搜索查询的函数
function parseSearchQuery(query: string): ParsedSearchQuery {
  /**
   * 解析搜索指令与关键词
   * - 支持指令前缀：@title、@website、@content
   * - 当仅输入指令无关键词时，视为空搜索（不过滤）
   */
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
  /**
   * 从 URL 提取顶级域名（去掉 www 前缀），用于在表格中展示来源站点
   */
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

const pageCount = computed(() => {
  if (searchTotal.value <= 0) return 1;
  return Math.ceil(searchTotal.value / PAGE_SIZE);
});

const pageSize = PAGE_SIZE;

watch(searchQuery, () => {
  currentPage.value = 1;
  void fetchClips();
});

watch([sortColumn, sortOrder], () => {
  currentPage.value = 1;
  void fetchClips();
});

watch(currentPage, () => {
  void fetchClips();
});

async function fetchClips() {
  try {
    // 基于查询与排序的后台分页搜索
    const parsedQuery = parseSearchQuery(searchQuery.value);
    const { items, total } = await searchClips({
      type: parsedQuery.type,
      keyword: parsedQuery.keyword,
      page: currentPage.value,
      pageSize: PAGE_SIZE,
      sortBy: sortColumn.value as any,
      sortOrder: sortOrder.value
    });
    paginatedClips.value = items;
    searchTotal.value = total;
    // 维持原始全量剪辑缓存（可选）
    if (!parsedQuery.keyword && currentPage.value === 1) {
      clips.value = items;
    }
  } catch (error) {
    message.error(`加载摘抄列表失败: ${(error as Error).message}`);
  }
}

async function deleteClip(id: string) {
  try {
    await deleteClipById(id);
    message.success('摘抄已删除');
    
    // 删除后不需要手动刷新缓存，deleteClipById 已经处理
    // 并且会触发 BroadcastChannel 通知，自动刷新页面
    
    // 本地立即刷新当前页面
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
  
  // 创建 BroadcastChannel 监听数据变化
  try {
    syncChannel = new BroadcastChannel('clipsey-storage-sync');
    syncChannel.onmessage = handleBroadcastMessage;
    
    if (import.meta.env.DEV) {
      console.log('[ClipManager] BroadcastChannel listener registered');
    }
  } catch (error) {
    console.warn('[ClipManager] BroadcastChannel not supported, sync disabled:', error);
  }
});

/**
 * 组件卸载时清理
 * 移除 BroadcastChannel 监听器，防止内存泄漏
 */
onBeforeUnmount(() => {
  if (syncChannel) {
    syncChannel.close();
    syncChannel = null;
  }
});

/**
 * 处理 BroadcastChannel 消息
 * 监听数据变化并静默刷新
 */
function handleBroadcastMessage(event: MessageEvent): void {
  if (event.data?.type === 'CLIPS_CHANGED') {
    if (import.meta.env.DEV) {
      console.log('[ClipManager Sync] Received storage change event:', {
        oldCount: event.data.oldCount,
        newCount: event.data.newCount,
        timestamp: event.data.timestamp
      });
    }
    // 静默刷新,不打扰用户当前操作
    void fetchClips();
  }
}

// Table 唯一键
const rowKey = (record: Clip) => record.id;
</script>



