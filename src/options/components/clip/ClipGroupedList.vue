<template>
  <div v-if="!groups.length" class="clip-group-empty">
    <a-empty :description="t('clipGroupEmpty')" />
  </div>
  <div v-else class="clip-group-list">
    <a-card
      v-for="group in groups"
      :key="group.key"
      size="small"
      :class="['clip-group-card', { 'clip-group-card--collapsed': !isExpanded(group.key) }]"
    >
      <template #title>
        <div class="clip-group-card__header">
          <span class="clip-group-card__title">{{ group.label }}</span>
          <span class="clip-group-card__count">({{ group.clips.length }})</span>
        </div>
      </template>
      <template #extra>
        <a-button type="link" size="small" @click="toggleGroup(group.key)">
          {{ isExpanded(group.key) ? t('clipGroupCollapse') : t('clipGroupExpand') }}
        </a-button>
      </template>
      <div v-if="isExpanded(group.key)">
        <div
          v-for="clipItem in group.clips"
          :key="clipItem.id"
          class="clip-group-item"
        >
          <div class="clip-group-item__content">
              <div class="clip-group-item__header">
                <div class="clip-group-item__title">{{ clipItem.title || t('clipNoTitle') }}</div>
                <div class="clip-group-item__tags">
                  <span
                    class="clip-badge"
                    v-if="clipItem.sourceUrl && !isDomainClassification"
                  >
                    {{ getDomainFromUrl(clipItem.sourceUrl) || t('clipNoUrl') }}
                  </span>
                  <span class="clip-badge clip-badge--muted" v-if="clipItem.createdAt">
                    {{ formatDate(clipItem.createdAt) }}
                  </span>
                </div>
              </div>
              <div class="clip-group-item__excerpt">{{ getClipPreview(clipItem) }}</div>
            <div class="clip-group-item__meta-row" v-if="isDomainClassification">
              <div class="clip-group-item__url">
                <template v-if="clipItem.sourceUrl">
                  <a :href="clipItem.sourceUrl" target="_blank" rel="noreferrer">
                    {{ clipItem.sourceUrl }}
                  </a>
                </template>
                <template v-else>{{ t('clipNoUrlAlt') }}</template>
              </div>
            </div>
            <div class="clip-group-item__meta-row" v-else>
              <div class="clip-group-item__meta">
                <span>{{ formatDate(clipItem.createdAt) }}</span>
                <span v-if="clipItem.sourceUrl">
                  {{ t('clipFromSource') }} {{ getDomainFromUrl(clipItem.sourceUrl) || t('clipNoUrl') }}
                </span>
              </div>
            </div>
          </div>
          <div class="clip-group-item__actions">
            <a-button size="small" @click="openClipDetail(clipItem)">{{ t('clipViewButton') }}</a-button>
            <a-button
              size="small"
              type="primary"
              :disabled="!clipItem.sourceUrl"
              :loading="openingId === clipItem.id"
              @click="openClipAction(clipItem)"
            >
              {{ t('clipOpenButton') }}
            </a-button>
            <a-popconfirm :title="t('clipDeleteConfirm')" @confirm="deleteClip(clipItem.id)">
              <a-button size="small" danger>{{ t('clipDeleteButton') }}</a-button>
            </a-popconfirm>
          </div>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Clip } from '@/types/clip';

const { t } = useI18n();

type ClipGroup = { key: string; label: string; clips: Clip[] };

defineProps<{
  groups: ClipGroup[];
  isDateClassification: boolean;
  isDomainClassification: boolean;
  isExpanded: (key: string) => boolean;
  toggleGroup: (key: string) => void;
  getClipPreview: (clip: Clip) => string;
  formatDate: (iso?: string) => string;
  getDomainFromUrl: (url?: string) => string;
  openClipDetail: (clip: Clip) => void;
  openClipAction: (clip: Clip) => void;
  deleteClip: (id: string) => void;
  openingId?: string | null;
}>();
</script>

<style scoped>
.clip-group-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.clip-group-card {
  border-radius: 10px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.clip-group-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 14px;
}

.clip-group-card__count {
  color: #8c8c8c;
  font-size: 12px;
}

.clip-group-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #f5f5f5;
}

.clip-group-item:first-of-type {
  border-top: none;
}

.clip-group-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clip-group-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.clip-group-item__title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.clip-group-item__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.clip-badge {
  background-color: #f0f5ff;
  color: #1d39c4;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.clip-badge--muted {
  background-color: #f5f5f5;
  color: #595959;
}

.clip-group-item__excerpt {
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clip-group-item__meta-row {
  font-size: 12px;
  color: #8c8c8c;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.clip-group-item__meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.clip-group-item__url {
  font-size: 12px;
  color: #8c8c8c;
  word-break: break-all;
}

.clip-group-item__url a {
  color: #1677ff;
  text-decoration: none;
}

.clip-group-item__url a:hover {
  text-decoration: underline;
}

.clip-group-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.clip-muted {
  color: #8c8c8c;
}

.clip-group-empty {
  padding: 32px 0;
}
</style>
