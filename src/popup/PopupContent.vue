<template>
  <div class="popup-container">
    <div class="popup-header">
      <a-row align="middle" justify="space-between" :wrap="false" :gutter="12">
        <a-col flex="none">
          <a-typography-title :level="5" style="margin-bottom: 0;">
            Clipsey
          </a-typography-title>
        </a-col>
        <a-col flex="auto" style="min-width: 0;">
          <a-typography-text 
            v-if="displayUrl" 
            type="secondary" 
            :ellipsis="{ tooltip: currentUrl }"
            style="font-size: 12px; color: #888;"
          >
            {{ displayUrl }}
          </a-typography-text>
        </a-col>
        <a-col flex="none">
          <a-space :size="4">
            <a-tooltip placement="bottom" trigger="hover">
              <template #title>刷新</template>
              <a-button
                size="small"
                type="text"
                @click="handleRefresh"
                :loading="loading"
                aria-label="刷新"
              >
                <template #icon>
                  <ReloadOutlined />
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip placement="bottom" trigger="hover">
              <template #title>设置</template>
              <a-button
                size="small"
                type="text"
                @click="openSettings"
                aria-label="设置"
              >
                <template #icon>
                  <SettingOutlined />
                </template>
              </a-button>
            </a-tooltip>
          </a-space>
        </a-col>
      </a-row>
    </div>
    <a-divider style="margin: 8px 0;" />
    <a-spin :spinning="loading">
      <div class="clips-content">
        <template v-if="filteredClips.length > 0">
          <clip-list :clips="filteredClips" />
        </template>
        <a-empty 
          v-else 
          description="当前页面暂无保存的摘要"
          :image="emptyImage"
        >
          <template #description>
            <a-typography-text type="secondary">
              在当前页面选中文本后右键点击<br />"Clip current selection" 即可保存摘要
            </a-typography-text>
          </template>
        </a-empty>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { message, Empty } from 'ant-design-vue';
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage, isChromeExtensionEnv } from '@/utils/chrome';

const emptyImage = Empty.PRESENTED_IMAGE_SIMPLE;

const clips = ref<Clip[]>([]);
const loading = ref(false);
const currentUrl = ref<string>('');
const chromeEnv = isChromeExtensionEnv();

// BroadcastChannel 用于跨页面同步
let syncChannel: BroadcastChannel | null = null;

// 计算属性：过滤当前URL匹配的clips并按时间降序排列
const filteredClips = computed(() => {
  if (!currentUrl.value) return [];
  const filtered = clips.value.filter(clip => {
    if (!clip.sourceUrl) return false;
    try {
      const clipUrl = new URL(clip.sourceUrl);
      const currentUrlObj = new URL(currentUrl.value);
      // 比较协议、主机名和路径
      return clipUrl.protocol === currentUrlObj.protocol &&
             clipUrl.hostname === currentUrlObj.hostname &&
             clipUrl.pathname === currentUrlObj.pathname;
    } catch {
      return false;
    }
  });
  
  // 按创建时间降序排列（最新的在最上方）
  return filtered.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });
});

// 显示URL（简洁形式）
const displayUrl = computed(() => {
  if (!currentUrl.value) return '';
  try {
    const url = new URL(currentUrl.value);
    // 显示域名 + 路径
    let display = url.hostname.replace(/^www\./i, '');
    if (url.pathname && url.pathname !== '/') {
      display += url.pathname;
    }
    // 如果过长，使用省略号
    const maxLength = 40;
    if (display.length > maxLength) {
      return display.substring(0, maxLength) + '...';
    }
    return display;
  } catch {
    return currentUrl.value;
  }
});

async function getCurrentTabUrl(): Promise<void> {
  try {
    if (chromeEnv && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        currentUrl.value = tab.url;
      }
    }
  } catch (error) {
    console.error('获取当前标签页URL失败:', error);
  }
}

/**
 * 加载Clips数据
 * 优化:
 * 1. 支持静默刷新(不显示loader),用于监听到数据变化时的后台更新
 * 2. 强制刷新后端缓存，确保获取最新数据
 */
async function loadClips(showLoader: boolean = true): Promise<void> {
  if (showLoader) {
    loading.value = true;
  }
  try {
    // 先刷新后端缓存，避免读取到过时数据
    try {
      await sendMessage({ type: 'REFRESH_CACHE' });
    } catch (error) {
      console.debug('[Popup] Cache refresh failed (non-critical):', error);
    }
    
    const response = await sendMessage<{ success: boolean; data?: Clip[]; error?: string }>({
      type: 'REQUEST_CLIPS'
    });
    if (response?.success) {
      clips.value = response.data ?? [];
    } else {
      // 只在显示loader时才显示错误消息,静默刷新失败不打扰用户
      if (showLoader) {
        message.error(response?.error ?? '加载剪辑失败');
      }
    }
  } catch (error) {
    // 只在显示loader时才显示错误消息
    if (showLoader) {
      message.error('加载剪辑失败');
    }
    console.error('加载剪辑失败:', error);
  } finally {
    if (showLoader) {
      loading.value = false;
    }
  }
}

function openSettings(): void {
  try {
    if (chromeEnv && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      const url = new URL('/src/options/index.html', window.location.origin).toString();
      window.open(url, '_blank');
    }
  } catch {
    message.error('打开设置失败');
  }
}

/**
 * 手动刷新摘要列表
 * 用户点击刷新按钮时调用,重新加载最新的clips数据
 */
async function handleRefresh(): Promise<void> {
  await loadClips(true);
  message.success('已刷新');
}



/**
 * 组件挂载时初始化
 * 优化：
 * 1. 并行加载clips数据和当前标签页URL,提高加载速度
 * 2. 使用 BroadcastChannel 监听跨页面数据变化
 */
onMounted(async () => {
  // 每次打开弹窗时都重新加载数据,确保显示最新内容
  await Promise.all([loadClips(true), getCurrentTabUrl()]);
  
  // 创建 BroadcastChannel 监听数据变化
  try {
    syncChannel = new BroadcastChannel('clipsey-storage-sync');
    syncChannel.onmessage = handleBroadcastMessage;
    
    if (import.meta.env.DEV) {
      console.log('[Popup] BroadcastChannel listener registered');
    }
  } catch (error) {
    console.warn('[Popup] BroadcastChannel not supported, sync disabled:', error);
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
      console.log('[Popup Sync] Received storage change event:', {
        oldCount: event.data.oldCount,
        newCount: event.data.newCount,
        timestamp: event.data.timestamp
      });
    }
    // 静默刷新,不显示loader,不打扰用户
    void loadClips(false);
  }
}
</script>

<style scoped>
.popup-container {
  padding: 16px;
  width: 100%;
}

.popup-header {
  margin-bottom: 0;
}

.clips-content {
  max-height: 520px;
  overflow-y: auto;
  padding: 4px 2px;
}

.clips-content::-webkit-scrollbar {
  width: 6px;
}

.clips-content::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 3px;
}

.clips-content::-webkit-scrollbar-thumb {
  background: #bfbfbf;
  border-radius: 3px;
}

.clips-content::-webkit-scrollbar-thumb:hover {
  background: #8c8c8c;
}
</style>






