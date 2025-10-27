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
      </n-space>
    </template>
    <n-space vertical size="large">

      <n-input v-model:value="query" placeholder="搜索标题、内容或来源" clearable size="small" />
      <n-spin :show="loading">
        <n-scrollbar style="max-height: 480px;">
          <clip-list :clips="filteredClips" />
        </n-scrollbar>
      </n-spin>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NCard, NInput, NSpace, NSpin, NText, NScrollbar, NAlert, NIcon, NEllipsis, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage } from '@/utils/chrome';

const clips = ref<Clip[]>([]);
const loading = ref(false);
const query = ref('');
const message = useMessage();

const repoUrl = 'https://github.com/Shenean/Clipsey';
function openRepo(): void {
  window.open(repoUrl, '_blank');
}

const filteredClips = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return clips.value;
  return clips.value.filter((c) => {
    const title = c.title?.toLowerCase() ?? '';
    const text = c.textContent?.toLowerCase() ?? '';
    const url = c.sourceUrl?.toLowerCase() ?? '';
    return title.includes(q) || text.includes(q) || url.includes(q);
  });
});

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
      message.success('已清空剪辑');
    } else {
      message.error(response?.error ?? '清空失败');
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
