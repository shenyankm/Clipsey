<template>
  <n-card size="small" class="clip-item">
    <template #header>
      <div class="clip-item__header">
        <div class="clip-item__row">
          <n-tooltip v-if="showTitleTooltip" trigger="hover">
            <template #trigger>
              <span ref="titleRef" class="clip-item__title">{{ titleText }}</span>
            </template>
            <span class="clip-item__tooltip">{{ titleText }}</span>
          </n-tooltip>
          <span v-else ref="titleRef" class="clip-item__title">{{ titleText }}</span>
        </div>
        <div class="clip-item__row">
          <n-tooltip v-if="clip.sourceUrl && showUrlTooltip" trigger="hover">
            <template #trigger>
              <span ref="urlRef" class="clip-item__url">{{ clip.sourceUrl }}</span>
            </template>
            <span class="clip-item__tooltip">{{ clip.sourceUrl }}</span>
          </n-tooltip>
          <span v-else-if="clip.sourceUrl" ref="urlRef" class="clip-item__url">
            {{ clip.sourceUrl }}
          </span>
          <span v-else class="clip-item__url clip-item__url--placeholder">{{ missingUrlLabel }}</span>
        </div>
      </div>
    </template>
    <div class="clip-item__content" :class="{ 'clip-item__content--expanded': isExpanded }">
      <p
        ref="textRef"
        class="clip-item__text"
        :class="{ 'clip-item__text--clamped': !isExpanded }"
      >
        {{ hasSummary ? summaryText : '暂无摘要' }}
      </p>
      <n-button
        v-if="showExpandButton"
        text
        size="small"
        class="clip-item__expand"
        @click="handleExpand"
      >
        {{ expandButtonLabel }}
      </n-button>
    </div>
    <template #footer>
      <div class="clip-item__meta">
        <n-text depth="3">{{ formattedDate }}</n-text>
        <n-button text :disabled="!clip.sourceUrl" :loading="opening" @click="handleOpen">
          Open
        </n-button>
      </div>
    </template>
  </n-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NCard, NText, NTooltip, useMessage } from 'naive-ui';
import type { Clip } from '@/types/clip';
import { formatDate } from '@/utils/helpers';
import { sendMessage } from '@/utils/chrome';

const props = defineProps<{
  clip: Clip;
}>();

const formattedDate = computed(() => formatDate(props.clip.createdAt));
const titleText = computed(() => props.clip.title?.trim() || 'Untitled clip');
const message = useMessage();
const opening = ref(false);
const isExpanded = ref(false);
const showExpandButton = ref(false);
const textRef = ref<HTMLElement | null>(null);
const titleRef = ref<HTMLElement | null>(null);
const urlRef = ref<HTMLElement | null>(null);
const showTitleTooltip = ref(false);
const showUrlTooltip = ref(false);
const expandLabel = '\u67E5\u770B\u5168\u90E8';
const collapseLabel = '\u6536\u8D77';
const missingUrlLabel = 'Source URL not provided';
const summaryText = computed(() => props.clip.textContent?.trim() ?? '');
const hasSummary = computed(() => summaryText.value.length > 0);
const expandButtonLabel = computed(() =>
  isExpanded.value ? collapseLabel : expandLabel
);

function checkHeaderOverflow() {
  const titleEl = titleRef.value;
  const urlEl = urlRef.value;

  showTitleTooltip.value = Boolean(
    titleEl && titleEl.scrollWidth - titleEl.clientWidth > 1
  );

  if (!props.clip.sourceUrl) {
    showUrlTooltip.value = false;
    return;
  }

  showUrlTooltip.value = Boolean(
    urlEl && urlEl.scrollWidth - urlEl.clientWidth > 1
  );
}

function checkContentOverflow() {
  const el = textRef.value;

  if (!el || !hasSummary.value) {
    showExpandButton.value = false;
    return;
  }

  if (isExpanded.value) {
    showExpandButton.value = true;
    return;
  }

  showExpandButton.value = el.scrollHeight - el.clientHeight > 1;
}

function handleExpand() {
  if (!hasSummary.value) {
    return;
  }

  isExpanded.value = !isExpanded.value;
  if (!isExpanded.value) {
    nextTick(() => {
      checkContentOverflow();
    });
  }
}

async function handleOpen() {
  if (opening.value) {
    return;
  }

  if (!props.clip.sourceUrl) {
    message.warning('No source URL available');
    return;
  }

  opening.value = true;
  try {
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'OPEN_CLIP',
      payload: { id: props.clip.id }
    });

    if (!response?.success) {
      throw new Error(response?.error ?? 'Unable to open clip');
    }

    window.close();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    opening.value = false;
  }
}

let resizeObserver: ResizeObserver | null = null;
let fallbackResizeHandler: (() => void) | null = null;

function handleDimensionChange() {
  checkHeaderOverflow();
  checkContentOverflow();
}

function setupResizeMonitoring() {
  if (typeof ResizeObserver === 'undefined') {
    fallbackResizeHandler = () => {
      handleDimensionChange();
    };
    window.addEventListener('resize', fallbackResizeHandler);
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    handleDimensionChange();
  });

  updateResizeObserverTargets();
}

function updateResizeObserverTargets() {
  if (!resizeObserver) {
    return;
  }

  resizeObserver.disconnect();

  const targets = [titleRef.value, urlRef.value, textRef.value].filter(
    (element): element is HTMLElement => Boolean(element)
  );

  targets.forEach(element => resizeObserver?.observe(element));
}

function teardownResizeMonitoring() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (fallbackResizeHandler) {
    window.removeEventListener('resize', fallbackResizeHandler);
    fallbackResizeHandler = null;
  }
}

onMounted(() => {
  setupResizeMonitoring();
  nextTick(() => {
    updateResizeObserverTargets();
    checkHeaderOverflow();
    checkContentOverflow();
  });
});

onBeforeUnmount(() => {
  teardownResizeMonitoring();
});

watch(
  () => props.clip.title,
  () => {
    showTitleTooltip.value = false;
    nextTick(() => {
      checkHeaderOverflow();
      updateResizeObserverTargets();
    });
  }
);

watch(
  () => props.clip.sourceUrl,
  () => {
    showUrlTooltip.value = false;
    nextTick(() => {
      checkHeaderOverflow();
      updateResizeObserverTargets();
    });
  }
);

watch(
  () => props.clip.textContent,
  () => {
    isExpanded.value = false;
    nextTick(() => {
      checkContentOverflow();
      updateResizeObserverTargets();
    });
  }
);

watch(isExpanded, expanded => {
  nextTick(() => {
    checkContentOverflow();
    updateResizeObserverTargets();
  });
});
</script>

<style scoped>
.clip-item {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.clip-item :deep(.n-card__header),
.clip-item :deep(.n-card__content),
.clip-item :deep(.n-card__footer) {
  padding-left: 14px;
  padding-right: 14px;
}

.clip-item :deep(.n-card__header) {
  padding-top: 14px;
  padding-bottom: 0;
}

.clip-item :deep(.n-card__content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.clip-item :deep(.n-card__footer) {
  padding-top: 10px;
  padding-bottom: 14px;
}

.clip-item__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
}

.clip-item__row {
  width: 100%;
  min-width: 0;
}

.clip-item__row :deep(.n-base-popper-trigger) {
  display: block;
  width: 100%;
}

.clip-item__title {
  display: block;
  max-width: 100%;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-item__url {
  display: block;
  max-width: 100%;
  font-size: 12px;
  color: var(--n-text-color-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-item__url--placeholder {
  color: var(--n-text-color-disabled);
}

.clip-item__tooltip {
  display: block;
  max-width: min(360px, 80vw);
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.clip-item__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.clip-item__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.clip-item__text--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
}

.clip-item__expand {
  align-self: flex-start;
  padding: 0;
}

.clip-item__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .clip-item :deep(.n-card__header),
  .clip-item :deep(.n-card__content),
  .clip-item :deep(.n-card__footer) {
    padding-left: 12px;
    padding-right: 12px;
  }

  .clip-item__text {
    font-size: 12px;
  }
}

@media (max-width: 360px) {
  .clip-item :deep(.n-card__header),
  .clip-item :deep(.n-card__content),
  .clip-item :deep(.n-card__footer) {
    padding-left: 10px;
    padding-right: 10px;
  }

  .clip-item__header {
    gap: 4px;
  }
}
</style>
