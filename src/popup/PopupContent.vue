<template>
  <div class="popup">
    <div class="popup__card">
      <n-space vertical size="large">
        <header class="popup__header">
          <h1>Page Clipper</h1>
          <n-space>
            <n-button size="small" @click="refreshClips" :loading="loading">Refresh</n-button>
            <n-button size="small" type="error" tertiary @click="handleClear" :loading="loading">
              Clear
            </n-button>
          </n-space>
        </header>
        <n-spin :show="loading">
          <clip-list :clips="clips" />
        </n-spin>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NSpace, NSpin, useMessage } from 'naive-ui';
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

<style scoped>
.popup {
  box-sizing: border-box;
  margin: 0 auto;
  width: min(520px, 100vw);
  padding: clamp(12px, 3vw, 20px);
}

.popup__card {
  display: block;
  width: 100%;
  border-radius: 18px;
  padding: clamp(18px, 3.5vw, 26px) clamp(16px, 4vw, 28px);
  border: 1px solid transparent;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(135deg, rgba(89, 120, 255, 0.75), rgba(91, 208, 168, 0.7) 45%, rgba(255, 211, 110, 0.78))
      border-box;
  box-shadow:
    0 18px 36px -22px rgba(15, 23, 42, 0.58),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.popup :deep(.n-space) {
  width: 100%;
  gap: clamp(16px, 2.5vw, 24px);
}

.popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.popup__header h1 {
  margin: 0;
  font-size: 18px;
}

@media (max-width: 480px) {
  .popup {
    width: 100vw;
    padding: 12px;
  }

  .popup__card {
    border-radius: 16px;
    padding: 20px 16px;
  }

  .popup__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}

@media (max-width: 360px) {
  .popup {
    padding: 10px;
  }

  .popup__card {
    padding: 18px 14px;
  }

  .popup__header h1 {
    font-size: 16px;
  }
}
</style>
