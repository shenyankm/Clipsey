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
  /* 确保列表容器不产生滚动条 */
  overflow: visible;
  /* 确保内容正确填充 */
  width: 100%;
  /* 添加适当的内边距 */
  padding: 8px 0;
}

.empty-state {
  /* 为空状态设置合适的高度，但不强制最小高度 */
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  /* 确保不产生滚动条 */
  overflow: hidden;
}

/* 确保 n-space 组件不产生额外的滚动行为 */
.clip-list-container :deep(.n-space) {
  width: 100%;
}
</style>
