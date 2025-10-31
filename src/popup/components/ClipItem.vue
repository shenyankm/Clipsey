<template>
  <div class="clip-item" ref="cardRef">
    <n-card size="small" hoverable>
      <template #header>
        <n-space align="center" justify="space-between" wrap>
          <div
            class="clip-item__title-row clip-item__hoverable"
            @click="toggleTitle"
            :aria-expanded="expandedTitle ? 'true' : 'false'"
          >
            <n-text class="clip-item__title" strong>
              <span
                class="clip-item__title-text"
                :class="{ 'clip-item__title-text--collapsed': !expandedTitle }"
              >
                {{ titleText }}
              </span>
            </n-text>
            <n-icon
              class="clip-item__hover-icon"
              :class="{ 'is-expanded': expandedTitle }"
              @click.stop="toggleTitle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path :d="titleChevronD" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </n-icon>
          </div>
          <n-tooltip
            v-if="topDomain"
            placement="bottom"
            trigger="hover"
            overlay-class="clipsey-tooltip-overlay"
            :overlay-style="{ maxWidth: cardWidth + 'px' }"
          >
            <template #trigger>
              <n-tag size="small" type="info" round>{{ topDomain }}</n-tag>
            </template>
            <div class="clip-item__tooltip-url">{{ clip.sourceUrl }}</div>
          </n-tooltip>
        </n-space>
      </template>
      <n-space vertical size="small">
        <div
          class="clip-item__summary-wrap clip-item__hoverable"
          @click="toggleSummary"
          :aria-expanded="expandedSummary ? 'true' : 'false'"
        >
          <div
            v-if="hasSummary"
            class="clip-item__summary clip-item__summary-html"
            :class="{
              'clip-item__summary--collapsed': !expandedSummary,
              'clip-item__summary--expanded': expandedSummary
            }"
            v-html="summaryHtml"
          />
          <n-text v-else depth="3">{{ missingSummaryLabel }}</n-text>
          <n-icon
            class="clip-item__hover-icon clip-item__summary-icon"
            :class="{ 'is-expanded': expandedSummary }"
            @click.stop="toggleSummary"
          >
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { NButton, NCard, NTag, NSpace, NText, NIcon, NTooltip, useMessage } from 'naive-ui';
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
const message = useMessage();
const opening = ref(false);

const cardRef = ref<HTMLElement | null>(null);
const cardWidth = ref(360);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = cardRef.value;
  if (!el) return;
  cardWidth.value = el.getBoundingClientRect().width;
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      cardWidth.value = entry.contentRect.width;
    }
  });
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

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

function toggleTitle(): void {
  expandedTitle.value = !expandedTitle.value;
}

function toggleSummary(): void {
  expandedSummary.value = !expandedSummary.value;
}

async function handleOpen(): Promise<void> {
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

<style scoped>
.clip-item__hoverable {
  display: flex;
  align-items: center;
}

.clip-item__title-row {
  gap: 8px;
  width: 100%;
  padding: 6px 0;
  cursor: pointer;
}

.clip-item__title {
  font-size: 16px;
}

.clip-item__title-text {
  display: inline-block;
  /* 展开状态下允许正常换行 */
  white-space: normal;
}

.clip-item__title-text--collapsed {
  /* 收起状态：单行省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-item__hover-icon {
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}

.clip-item__hoverable:hover .clip-item__hover-icon {
  opacity: 1;
}

.clip-item__hover-icon.is-expanded {
  transform: rotate(180deg);
}

.clip-item__summary-wrap {
  position: relative;
  width: 100%;
  padding: 6px 0;
}

.clip-item__summary {
  line-height: 1.6;
  transition: max-height 0.25s ease;
  will-change: max-height;
}

.clip-item__summary-html {
  width: 100%;
  color: inherit;
}

.clip-item__summary--collapsed {
  /* 3 行的高度：3 * 1.6em = 4.8em */
  max-height: 4.8em;
  overflow: hidden;
}

.clip-item__summary--expanded {
  /* 使用一个较大的 max-height 以实现过渡动画 */
  max-height: 9999px;
}

.clip-item__summary-html :deep(.clipsey-inline-highlight) {
  background-color: rgba(251, 191, 36, 0.45);
  border-radius: 3px;
  padding: 0 2px;
}

.clip-item__summary-icon {
  position: absolute;
  right: 0;
  top: 0;
}

.clip-item__tooltip-url {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
