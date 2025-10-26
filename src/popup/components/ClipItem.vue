<template>
  <n-card size="small" class="clip-item" :title="clip.title || 'Untitled clip'">
    <div class="clip-item__content">
      <n-scrollbar x-scrollable>
        <p class="clip-item__text">{{ clip.textContent }}</p>
      </n-scrollbar>
    </div>
    <template #footer>
      <div class="clip-item__meta">
        <n-text depth="3">{{ formattedDate }}</n-text>
        <n-button text tag="a" :href="clip.sourceUrl" target="_blank">Open</n-button>
      </div>
    </template>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCard, NScrollbar, NText } from 'naive-ui';
import type { Clip } from '@/types/clip';
import { formatDate } from '@/utils/helpers';

const props = defineProps<{
  clip: Clip;
}>();

const formattedDate = computed(() => formatDate(props.clip.createdAt));
</script>

<style scoped>
.clip-item {
  width: 100%;
}

.clip-item__content {
  max-height: 120px;
}

.clip-item__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.clip-item__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
