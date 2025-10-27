<template>
  <n-card size="small" hoverable>
    <template #header>
      <n-space align="center" justify="space-between" wrap>
        <n-ellipsis tooltip>
          <n-text strong>{{ titleText }}</n-text>
        </n-ellipsis>
        <n-tag v-if="domain" size="small" type="info" round>{{ domain }}</n-tag>
      </n-space>
    </template>
    <n-space vertical size="small">
      <n-ellipsis
        v-if="hasSummary"
        :line-clamp="2"
        expand-trigger="click"
        :tooltip="false"
        :expand-text="expandLabel"
        :collapse-text="collapseLabel"
      >
        <n-text style="display: block; white-space: pre-line;">
          {{ summaryText }}
        </n-text>
      </n-ellipsis>
      <n-text v-else depth="3">{{ missingSummaryLabel }}</n-text>
    </n-space>
    <template #footer>
      <n-space justify="space-between" align="center" wrap>
        <n-text depth="3">{{ formattedDate }}</n-text>
        <n-button text :disabled="!clip.sourceUrl" :loading="opening" @click="handleOpen">
          打开
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NCard, NEllipsis, NTag, NSpace, NText, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import { formatDate } from '@/utils/helpers';
import { sendMessage } from '@/utils/chrome';

const props = defineProps<{ clip: Clip }>();

const formattedDate = computed(() => formatDate(props.clip.createdAt));
const titleText = computed(() => props.clip.title?.trim() || '未命名剪辑');
const summaryText = computed(() => props.clip.textContent?.trim() ?? '');
const hasSummary = computed(() => summaryText.value.length > 0);
const message = useMessage();
const opening = ref(false);

const domain = computed(() => {
  const url = props.clip.sourceUrl;
  if (!url) return '';
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./i, '');
  } catch {
    return '';
  }
});

const expandLabel = '查看全部';
const collapseLabel = '收起';
const missingSummaryLabel = '暂无摘要';

async function handleOpen() {
  if (opening.value) return;
  if (!props.clip.sourceUrl) {
    message.warning('无可用来源链接');
    return;
  }
  opening.value = true;
  try {
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'OPEN_CLIP',
      payload: { id: props.clip.id }
    });
    if (!response?.success) throw new Error(response?.error ?? '无法打开剪辑');
    window.close();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    opening.value = false;
  }
}
</script>
