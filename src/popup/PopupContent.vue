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
    <n-space vertical size="large">
      <div style="display: flex; align-items: center; gap: 8px;">
        <n-select
          v-model:value="searchType"
          :options="searchTypeOptions"
          size="small"
          style="width: fit-content; min-width: 96px;"
        />
        <n-input
          v-model:value="query"
          placeholder="搜索标题、内容或来源"
          clearable
          size="small"
          style="flex: 1;"
        />
      </div>
      <n-spin :show="loading">
        <n-scrollbar style="max-height: 480px; min-height: 400px;">
          <clip-list :clips="filteredClips" />
        </n-scrollbar>
      </n-spin>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NCard, NInput, NSpace, NSpin, NText, NScrollbar, NIcon, NTooltip, NSelect, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage } from '@/utils/chrome';

const clips = ref<Clip[]>([]);
const loading = ref(false);
const query = ref('');
const searchType = ref<'all' | 'title' | 'url' | 'summary'>('all');
const searchTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '标题', value: 'title' },
  { label: '链接', value: 'url' },
  { label: '摘要', value: 'summary' }
];
const message = useMessage();

const filteredClips = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return clips.value;
  const type = searchType.value;
  return clips.value.filter((clip) => {
    const title = clip.title?.toLowerCase() ?? '';
    const text = clip.textContent?.toLowerCase() ?? '';
    const url = clip.sourceUrl?.toLowerCase() ?? '';
    if (type === 'title') return title.includes(q);
    if (type === 'url') return url.includes(q);
    if (type === 'summary') return text.includes(q);
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
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
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
): void {
  if (areaName !== 'local' || !changes.clips) {
    return;
  }
  void loadClips(false);
}
</script>
