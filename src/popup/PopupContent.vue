<template>
  <div class="popup">
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
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { NButton, NSpace, NSpin, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipList from './components/ClipList.vue';
import { sendMessage } from '@/utils/chrome';

const clips = ref<Clip[]>([]);
const loading = ref(false);
const message = useMessage();

async function refreshClips() {
  loading.value = true;
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
    loading.value = false;
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
});
</script>

<style scoped>
.popup {
  box-sizing: border-box;
  margin: 0 auto;
  padding: 20px 18px;
  width: min(480px, 100vw - 24px);
  background: #fff;
  border-radius: 12px;
}

.popup :deep(.n-space) {
  width: 100%;
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
    width: calc(100vw - 16px);
    padding: 16px 12px;
    border-radius: 8px;
  }

  .popup__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}

@media (max-width: 360px) {
  .popup {
    padding: 14px 10px;
  }

  .popup__header h1 {
    font-size: 16px;
  }
}
</style>
