<template>
  <a-list v-if="clips.length > 0" :data-source="clips" :split="false" item-layout="vertical">
    <template #renderItem="{ item }">
      <a-list-item style="padding: 0 0 10px 0;">
        <clip-item :clip="item" :opening="openingId === item.id" @open="handleOpen" />
      </a-list-item>
    </template>
  </a-list>
  <a-empty v-else :description="t('popupNoClips')" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Clip } from '@/types/clip';
import ClipItem from './ClipItem.vue';
import { useClipOpener } from '@/utils/clip/opener';

const { t } = useI18n();

defineProps<{
  clips: Clip[];
}>();

const { openingId, openClip } = useClipOpener(true);

async function handleOpen(clip: Clip): Promise<void> {
  await openClip(clip);
}
</script>
