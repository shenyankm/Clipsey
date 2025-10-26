<template>
  <n-list v-if="clips.length" bordered>
    <n-list-item v-for="clip in clips" :key="clip.id">
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
