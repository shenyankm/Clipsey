<template>
  <n-space v-if="clips.length" vertical size="large">
    <clip-item v-for="clip in clips" :key="clip.id" :clip="clip" />
  </n-space>
  <n-empty
    v-else
    description="暂无内容"
    :style="{ minHeight: '400px' }"
  />
</template>

<script setup lang="ts">
import { NEmpty, NSpace } from 'naive-ui';
import type { Clip } from '@/types/clip';
import ClipItem from './ClipItem.vue';

defineProps<{
  clips: Clip[];
}>();
</script>
