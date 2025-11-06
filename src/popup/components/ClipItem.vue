<template>
  <a-card size="small" hoverable>
    <template #title>
      <a-row align="middle" justify="space-between">
        <a-col>
          <a-typography-paragraph :ellipsis="{ rows: 1, expandable: true }">
            {{ titleText }}
          </a-typography-paragraph>
        </a-col>
        <a-col v-if="topDomain">
          <a-tooltip placement="bottom">
            <template #title>
              <span>{{ clip.sourceUrl }}</span>
            </template>
            <a-tag color="blue">{{ topDomain }}</a-tag>
          </a-tooltip>
        </a-col>
      </a-row>
    </template>
    <a-space direction="vertical">
      <template v-if="hasSummary">
        <a-collapse ghost>
          <a-collapse-panel key="summary" header="摘要">
            <div v-html="summaryHtml"></div>
          </a-collapse-panel>
        </a-collapse>
      </template>
      <a-typography-text v-else type="secondary">{{ missingSummaryLabel }}</a-typography-text>
      <a-row align="middle" justify="space-between">
        <a-col>
          <a-typography-text type="secondary">{{ formattedDate }}</a-typography-text>
        </a-col>
        <a-col>
          <a-button type="link" :disabled="!clip.sourceUrl" :loading="opening" @click.stop="handleOpen">
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

const MULTI_PART_TLDS = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.cn', 'net.cn', 'org.cn', 'gov.cn']);

const props = defineProps<{ clip: Clip }>();

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
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'OPEN_CLIP',
      payload: { id: props.clip.id }
    });
    if (!response?.success) {
      throw new Error(response?.error ?? '无法打开剪辑');
    }
    window.close();
  } catch (error) {
    message.error((error as Error).message || '无法打开剪辑');
  } finally {
    opening.value = false;
  }
}
</script>
