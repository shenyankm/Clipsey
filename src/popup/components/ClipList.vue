<template>
  <div v-if="clips.length > 0" class="clip-list-container">
    <n-space vertical :size="8">
      <clip-item
        v-for="clip in clips"
        :key="clip.id"
        :clip="clip"
      />
    </n-space>
  </div>
  <n-empty v-else description="暂无剪贴板内容" class="empty-state" />
</template>

<script setup lang="ts">
import { NEmpty, NSpace } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipItem from './ClipItem.vue';

defineProps<{
  clips: Clip[];
}>();
</script>

<style scoped>
.clip-list-container {
  overflow: visible;
  width: 100%;
  padding: 8px 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  overflow: hidden;
}

.clip-list-container :deep(.n-space) {
  width: 100%;
}
</style>
