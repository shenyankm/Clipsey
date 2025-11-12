<template>
  <a-list v-if="clips.length > 0" :data-source="clips" :split="false" item-layout="vertical">
    <template #renderItem="{ item }">
      <a-list-item style="padding: 0 0 10px 0;">
        <clip-item :clip="item" :opening="openingId === item.id" @open="handleOpen" />
      </a-list-item>
    </template>
  </a-list>
  <a-empty v-else description="暂无剪贴板内容" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import type { Clip } from '@/types/clip';
import { sendMessage } from '@/utils/chrome';
import { ErrorHandler } from '@/utils/error-handler';
import type { MessageResponse } from '@/types/message';
import ClipItem from './ClipItem.vue';

const props = defineProps<{
  clips: Clip[];
}>();

const openingId = ref<string | null>(null);

async function handleOpen(clip: Clip): Promise<void> {
  if (openingId.value || !clip.sourceUrl) {
    if (!clip.sourceUrl) {
      message.warning('暂无可用的来源链接');
    }
    return;
  }

  openingId.value = clip.id;
  try {
    const response = await sendMessage<MessageResponse>({
      type: 'OPEN_CLIP',
      payload: { id: clip.id }
    });
    if (!response?.success) {
      throw new Error(response?.error ?? '无法打开剪辑');
    }
    window.close();
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'Open clip from popup');
    message.error(appError.userMessage);
  } finally {
    openingId.value = null;
  }
}
</script>
