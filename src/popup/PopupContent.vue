<template>
  <div class="popup-container">
    <popup-header
      :display-url="displayUrl"
      :tooltip-url="currentUrl"
      :loading="loading"
      @refresh="handleRefresh"
      @open-settings="openSettings"
    />
    <a-divider style="margin: 8px 0;" />
    <a-spin :spinning="loading">
      <div class="clips-content">
        <template v-if="filteredClips.length > 0">
          <clip-list :clips="filteredClips" />
        </template>
        <a-empty 
          v-else 
          :description="t('popupNoClips')"
          :image="emptyImage"
        >
          <template #description>
            <a-typography-text type="secondary" style="white-space: pre-line;">
              {{ t('popupNoClipsHint') }}
            </a-typography-text>
          </template>
        </a-empty>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { message, Empty } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { browser } from 'wxt/browser';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import PopupHeader from './components/PopupHeader.vue';
import { sendMessage, isChromeExtensionEnv } from '@/utils/chrome';
import { useClipFilter } from '@/composables/useClipFilter';
import { useClipSort } from '@/composables/useClipSort';
import { useBroadcastSync } from '@/composables/useBroadcastSync';

const { t } = useI18n();
const clips = ref<Clip[]>([]);
const loading = ref(false);
const currentUrl = ref<string>('');
const chromeEnv = isChromeExtensionEnv();
const emptyImage = Empty.PRESENTED_IMAGE_SIMPLE;

// 使用组合式函数
const { filteredClips: urlFilteredClips } = useClipFilter(clips, currentUrl);
const { sortedClips: filteredClips } = useClipSort(urlFilteredClips, 'desc');

// 使用BroadcastChannel同步
useBroadcastSync('clipsey-storage-sync', (data) => {
  if (import.meta.env.DEV) {
    console.log('[Popup Sync] Received storage change event:', {
      oldCount: data.oldCount,
      newCount: data.newCount,
      timestamp: data.timestamp
    });
  }
  // 静默刷新,不显示loader,不打扰用户
  void loadClips(false);
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
    if (chromeEnv && browser.tabs) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        currentUrl.value = tab.url;
      }
    }
  } catch (error) {
    console.error('获取当前标签页URL失败:', error);
  }
}

/** 加载剪辑数据：支持静默刷新与缓存强制更新（默认显示加载状态） */
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
        message.error(response?.error ?? t('popupLoadFailed'));
      }
    }
  } catch (error) {
    // 只在显示loader时才显示错误消息
    if (showLoader) {
      message.error(t('popupLoadFailed'));
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
    // 统一使用显式 URL，避免极端情况下 openOptionsPage 回退到扩展详情页
    const url = (browser.runtime as any).getURL('/options.html');

    // 在扩展环境下优先通过 tabs.create 新开标签页，体验更稳定
    if (chromeEnv && browser.tabs?.create) {
      browser.tabs.create({ url });
      return;
    }

    // 其次尝试 openOptionsPage（某些浏览器版本兼容性存在差异）
    if (chromeEnv && browser.runtime?.openOptionsPage) {
      browser.runtime.openOptionsPage();
      return;
    }

    // 开发环境或无扩展 API 时，直接在新窗口打开构建产物
    window.open(url, '_blank');
  } catch (error) {
    console.error('打开设置失败:', error);
    message.error(t('popupOpenSettingsFailed'));
  }
}

/**
 * 手动刷新摘要列表
 */
async function handleRefresh(): Promise<void> {
  await loadClips(true);
  message.success(t('popupRefreshed'));
}

/**
 * 组件挂载时初始化
 */
onMounted(async () => {
  await Promise.all([loadClips(true), getCurrentTabUrl()]);
});
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

