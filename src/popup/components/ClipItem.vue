<template>
  <!-- 移除 hover 阴影以实现更扁平化的视觉效果 -->
  <a-card size="small" @click="toggleExpand" style="cursor: pointer;">
    <a-space direction="vertical" style="width: 100%;" :size="8">
      <!-- 摘要内容 -->
      <template v-if="hasSummary">
        <div 
          :class="{ 'summary-content': true, 'summary-collapsed': !expanded }"
          v-html="summaryHtml"
        ></div>
      </template>
      <a-typography-text v-else type="secondary">{{ missingSummaryLabel }}</a-typography-text>
      
      <!-- 时间和跳转按钮 -->
      <a-row align="middle" justify="space-between" :gutter="8">
        <a-col flex="1" style="min-width: 0;">
          <a-typography-text type="secondary" style="font-size: 12px;">
            {{ formattedDate }}
          </a-typography-text>
        </a-col>
        <a-col flex="none">
          <a-button 
            type="primary" 
            size="small"
            :disabled="!clip.sourceUrl" 
              :loading="opening"
              @click.stop="handleOpen"
            >
              跳转
            </a-button>
        </a-col>
      </a-row>
    </a-space>
  </a-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Clip } from '@/types/clip';
import { formatClipDate } from '@/utils/clip-format';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';

const props = defineProps<{
  clip: Clip;
  opening: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', clip: Clip): void;
}>();

const expanded = ref(false);
const formattedDate = computed(() => formatClipDate(props.clip.createdAt));
const summaryHtml = computed(() => getClipHtmlContent(props.clip));
const hasSummary = computed(() => hasClipRichContent(props.clip));
const missingSummaryLabel = '暂无摘要';

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

function handleOpen(): void {
  if (!props.clip.sourceUrl || props.opening) {
    return;
  }
  emit('open', props.clip);
}
</script>

<style scoped>
/* 卡片扁平化：确保无阴影（包括悬停态） */
:deep(.ant-card) {
  box-shadow: none !important;
}

:deep(.ant-card-hoverable:hover) {
  box-shadow: none !important;
}

.summary-content {
  word-break: break-word;
  line-height: 1.6;
  transition: max-height 0.3s ease;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
}

.summary-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-content:deep(p) {
  margin: 0;
  padding: 0;
}

.summary-content:deep(p + p) {
  margin-top: 6px;
}
</style>
