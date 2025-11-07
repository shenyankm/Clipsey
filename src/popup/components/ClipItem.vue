<template>
  <a-card size="small" hoverable @click="toggleExpand" style="cursor: pointer;">
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
import { message } from 'ant-design-vue';
import type { Clip } from '@/types/clip';
import { formatDate } from '@/utils/helpers';
import { sendMessage } from '@/utils/chrome';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';
import { ErrorHandler } from '@/utils/error-handler';
import type { MessageResponse } from '@/types/message';

const props = defineProps<{ clip: Clip }>();

const expanded = ref(false);
const formattedDate = computed(() => formatDate(props.clip.createdAt));
const summaryHtml = computed(() => getClipHtmlContent(props.clip));
const hasSummary = computed(() => hasClipRichContent(props.clip));
const missingSummaryLabel = '暂无摘要';
const opening = ref(false);

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

async function handleOpen(): Promise<void> {
  /**
   * 定位到剪辑在页面中的位置：通过后台消息在当前标签页中高亮并滚动到对应位置
   * - 无来源链接时提示用户
   * - 打开过程中显示 loading 状态
   */
  if (opening.value) return;
  if (!props.clip.sourceUrl) {
    message.warning('暂无可用的来源链接');
    return;
  }
  opening.value = true;
  try {
    const response = await sendMessage<MessageResponse>({
      type: 'OPEN_CLIP',
      payload: { id: props.clip.id }
    });
    if (!response?.success) {
      throw new Error(response?.error ?? '无法打开剪辑');
    }
    window.close();
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'Open clip from popup');
    message.error(appError.userMessage);
  } finally {
    opening.value = false;
  }
}
</script>

<style scoped>
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
