<template>
  <n-card
    size="small"
    :segmented="{ content: true }"
    :bordered="false"
    :style="{ borderRadius: '0', boxShadow: 'none' }"
    :header-style="{ padding: '12px' }"
    :content-style="{ padding: '12px' }"
    :footer-style="{ padding: '12px' }"
  >
    <template #header>
      <n-space justify="space-between" align="center">
        <n-text strong style="font-size: 18px;">Clipsey</n-text>
      </n-space>
    </template>
    <template #header-extra>
      <n-space size="small">
        <n-button size="small" tertiary @click="refreshClips" :loading="loading">刷新</n-button>
        <n-button size="small" type="error" tertiary @click="handleClear" :loading="loading">清空</n-button>
        <n-tooltip placement="bottom" trigger="hover">
          <template #trigger>
            <n-button
              size="small"
              tertiary
              @click="openSettings"
              aria-label="设置"
              style="padding: 0 6px;"
            >
              <n-icon>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="10" cy="6" r="2" fill="currentColor" />
                  <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="14" cy="12" r="2" fill="currentColor" />
                  <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="8" cy="18" r="2" fill="currentColor" />
                </svg>
              </n-icon>
            </n-button>
          </template>
          设置
        </n-tooltip>
      </n-space>
    </template>
    <n-spin :show="loading">
      <div class="popup-content">
        <n-scrollbar>
          <clip-list :clips="clips" />
        </n-scrollbar>
      </div>
    </n-spin>
  </n-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NCard, NSpace, NSpin, NText, NScrollbar, NIcon, NTooltip, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage, isChromeExtensionEnv } from '@/utils/chrome';

const clips = ref<Clip[]>([]);
const loading = ref(false);
const message = useMessage();
const chromeEnv = isChromeExtensionEnv();

async function refreshClips(): Promise<void> {
  await loadClips(true);
}

async function loadClips(showLoader: boolean): Promise<void> {
  if (showLoader) {
    loading.value = true;
  }
  try {
    const response = await sendMessage<{ success: boolean; data?: Clip[]; error?: string }>({
      type: 'REQUEST_CLIPS'
    });
    if (response?.success) {
      clips.value = response.data ?? [];
    } else {
      message.error(response?.error ?? '加载剪辑失败');
    }
  } catch {
    message.error('加载剪辑失败');
  } finally {
    if (showLoader) {
      loading.value = false;
    }
  }
}

async function handleClear(): Promise<void> {
  loading.value = true;
  try {
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'CLEAR_CLIPS'
    });
    if (response?.success) {
      clips.value = [];
      message.success('已清空剪辑');
    } else {
      message.error(response?.error ?? '清空失败');
    }
  } catch {
    message.error('清空失败');
  } finally {
    loading.value = false;
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

onMounted(() => {
  refreshClips();
  if (chromeEnv && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
});

onBeforeUnmount(() => {
  if (chromeEnv && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  }
});

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes.clips) {
    return;
  }
  void loadClips(false);
}
</script>

<style scoped>
.popup-content {
  /* 允许内容区域根据需要滚动或溢出显示 */
  overflow: visible;
  /* 设置最小高度以保持一致的视觉体验 */
  min-height: 400px;
  /* 确保内容能够正确填充 */
  display: flex;
  flex-direction: column;
}

.popup-content :deep(.n-scrollbar) {
  /* 确保滚动条样式一致 */
  flex: 1;
}

.popup-content :deep(.n-scrollbar-content) {
  /* 确保内容正确填充滚动区域 */
  min-height: 100%;
}
</style>






