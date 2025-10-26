<template>
  <n-space
    vertical
    size="large"
    style="padding: 16px; max-width: 520px; margin: 0 auto;"
  >
    <n-card>
      <n-space vertical size="large">
        <n-space align="center" justify="space-between" wrap>
          <n-text strong style="font-size: 18px;">Page Clipper</n-text>
          <n-space size="small">
            <n-button size="small" @click="refreshClips" :loading="loading">Refresh</n-button>
            <n-button size="small" type="error" tertiary @click="handleClear" :loading="loading">
              Clear
            </n-button>
          </n-space>
        </n-space>
        <n-spin :show="loading">
          <clip-list :clips="clips" />
        </n-spin>
      </n-space>
    </n-card>
  </n-space>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NCard, NSpace, NSpin, NText, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage } from '@/utils/chrome';

const clips = ref<Clip[]>([]);
const loading = ref(false);
const message = useMessage();

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
      message.error(response?.error ?? 'Unable to load clips');
    }
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    if (showLoader) {
      loading.value = false;
    }
  }
}

async function handleClear() {
  loading.value = true;
  try {
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'CLEAR_CLIPS'
    });
    if (response?.success) {
      clips.value = [];
      message.success('Clips cleared');
    } else {
      message.error(response?.error ?? 'Clear failed');
    }
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refreshClips();

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
});

onBeforeUnmount(() => {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  }
});

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) {
  if (areaName !== 'local' || !changes.clips) {
    return;
  }

  void loadClips(false);
}
</script>
