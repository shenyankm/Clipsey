<template>
  <a-card
    size="small"
    :bordered="false"
  >
    <template #title>
      <a-row align="middle" justify="space-between">
        <a-col>
          <a-typography-title :level="5">Clipsey</a-typography-title>
        </a-col>
      </a-row>
    </template>
    <template #extra>
      <a-space size="small">
        <a-button size="small" type="link" @click="refreshClips" :loading="loading">刷新</a-button>
        <a-button size="small" type="link" danger @click="handleClear" :loading="loading">清空</a-button>
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
    </template>
    <a-spin :spinning="loading">
      <clip-list :clips="clips" />
    </a-spin>
  </a-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage, isChromeExtensionEnv } from '@/utils/chrome';
import { SettingOutlined } from '@ant-design/icons-vue';

const clips = ref<Clip[]>([]);
const loading = ref(false);
// 使用 Ant Design Vue 全局消息
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






