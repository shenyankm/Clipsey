<template>
  <a-card size="small" hoverable @click="toggleExpand" style="cursor: pointer;">
    <template #title>
      <a-row align="middle" justify="space-between" :gutter="8">
        <a-col flex="1" style="min-width: 0;">
          <a-typography-paragraph :ellipsis="{ rows: 1 }" style="margin-bottom: 0;">
            {{ titleText }}
          </a-typography-paragraph>
        </a-col>
        <a-col v-if="topDomain" flex="none">
          <a-tooltip placement="bottom">
            <template #title>
              <span>{{ clip.sourceUrl }}</span>
            </template>
            <a-tag color="blue">{{ topDomain }}</a-tag>
          </a-tooltip>
        </a-col>
      </a-row>
    </template>
    <a-space direction="vertical" style="width: 100%;">
      <template v-if="hasSummary">
        <div 
          :class="{ 'summary-content': true, 'summary-collapsed': !expanded }"
          v-html="summaryHtml"
        ></div>
      </template>
      <a-typography-text v-else type="secondary">{{ missingSummaryLabel }}</a-typography-text>
      <a-row align="middle" justify="space-between" :gutter="8">
        <a-col flex="1" style="min-width: 0;">
          <a-typography-text type="secondary" style="font-size: 12px;">{{ formattedDate }}</a-typography-text>
        </a-col>
        <a-col flex="none">
          <a-button 
            type="primary" 
            size="small"
            :disabled="!clip.sourceUrl" 
            :loading="opening" 
            @click.stop="handleOpen"
          >
            打开
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

const MULTI_PART_TLDS = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.cn', 'net.cn', 'org.cn', 'gov.cn']);

const props = defineProps<{ clip: Clip }>();

const expanded = ref(false);
const formattedDate = computed(() => formatDate(props.clip.createdAt));
const titleText = computed(() => props.clip.title?.trim() || '未命名剪辑');
const summaryHtml = computed(() => getClipHtmlContent(props.clip));
const hasSummary = computed(() => hasClipRichContent(props.clip));
const missingSummaryLabel = '暂无摘要';
// 使用 Ant Design Vue 全局消息
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

const topDomain = computed(() => {
  const host = domain.value;
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
});

// 标题与摘要的展开收起改用 Ant Design Vue 组件的内置交互，无需手动维护状态

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

async function handleOpen(): Promise<void> {
  /**
   * 打开剪辑来源页面：通过后台消息在扩展环境中定位并打开对应页面
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
  line-height: 1.5;
  transition: max-height 0.3s ease;
}

.summary-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-content:deep(p) {
  margin: 0;
  padding: 0;
}

.summary-content:deep(p + p) {
  margin-top: 8px;
}
</style>
