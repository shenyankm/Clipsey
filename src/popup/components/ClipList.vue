<template>
  <n-list v-if="clips.length" bordered class="clip-list">
    <n-list-item v-for="clip in clips" :key="clip.id" class="clip-list__item">
      <clip-item :clip="clip" />
    </n-list-item>
  </n-list>
  <n-empty v-else description="No clips yet" />
</template>

<script setup lang="ts">
import { NEmpty, NList, NListItem } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipItem from './ClipItem.vue';

defineProps<{
  clips: Clip[];
}>();
</script>

<style scoped>
.clip-list {
  width: 100%;
  max-width: 100%;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
}

.clip-list :deep(.n-list-item) {
  width: 100%;
  padding: 0;
}

.clip-list :deep(.n-list-item__main) {
  padding: 0;
  min-width: 0;
}

.clip-list__item {
  padding: 0;
  min-width: 0;
}

.clip-list__item + .clip-list__item :deep(.n-list-item) {
  border-top: 1px solid rgba(31, 35, 41, 0.08);
}
</style>
