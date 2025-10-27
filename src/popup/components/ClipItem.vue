<template>
  <n-card size="small" hoverable>
    <template #header>
      <n-space align="center" justify="space-between" wrap>
        <div class="clip-item__title-row clip-item__hoverable" @click="toggleTitle">
          <n-ellipsis v-if="!expandedTitle" :line-clamp="1" :tooltip="false">
            <n-text strong>{{ titleText }}</n-text>
          </n-ellipsis>
          <n-text v-else strong>{{ titleText }}</n-text>
          <n-icon class="clip-item__hover-icon" @click.stop="toggleTitle">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path :d="titleChevronD" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </n-icon>
        </div>
        <n-tag v-if="domain" size="small" type="info" round>{{ domain }}</n-tag>
      </n-space>
    </template>
    <n-space vertical size="small">
      <div class="clip-item__summary-wrap clip-item__hoverable" @click="toggleSummary">
        <n-ellipsis v-if="hasSummary && !expandedSummary" :line-clamp="2" :tooltip="false">
          <n-text style="display: block; white-space: pre-line;">
            {{ summaryText }}
          </n-text>
        </n-ellipsis>
        <n-text v-else-if="hasSummary" style="display: block; white-space: pre-line;">
          {{ summaryText }}
        </n-text>
        <n-text v-else depth="3">{{ missingSummaryLabel }}</n-text>
        <n-icon class="clip-item__hover-icon clip-item__summary-icon" @click.stop="toggleSummary">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path :d="summaryChevronD" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </n-icon>
      </div>
    </n-space>
    <template #footer>
      <n-space justify="space-between" align="center" wrap>
        <n-text depth="3">{{ formattedDate }}</n-text>
        <n-button text :disabled="!clip.sourceUrl" :loading="opening" @click.stop="handleOpen">
          打开
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NCard, NEllipsis, NTag, NSpace, NText, NIcon, useMessage } from 'naive-ui';
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

const expandedTitle = ref(false);
const expandedSummary = ref(false);

const chevronDownD = 'M7 10l5 5 5-5';
const chevronUpD = 'M7 14l5-5 5 5';
const titleChevronD = computed(() => (expandedTitle.value ? chevronUpD : chevronDownD));
const summaryChevronD = computed(() => (expandedSummary.value ? chevronUpD : chevronDownD));

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

const missingSummaryLabel = '暂无摘要';

function toggleTitle() {
  expandedTitle.value = !expandedTitle.value;
}

function toggleSummary() {
  expandedSummary.value = !expandedSummary.value;
}

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

<style scoped>
.clip-item__hoverable {
  display: flex;
  align-items: center;
}

.clip-item__title-row {
  gap: 8px;
}

.clip-item__hover-icon {
  opacity: 0;
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.clip-item__hoverable:hover .clip-item__hover-icon {
  opacity: 1;
}

.clip-item__summary-wrap {
  position: relative;
}

.clip-item__summary-icon {
  position: absolute;
  right: 0;
  top: 0;
}
</style>
