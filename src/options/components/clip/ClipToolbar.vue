<template>
  <a-card class="clip-toolbar" size="small" bordered>
    <div class="clip-toolbar__row">
      <div class="clip-toolbar__search">
        <a-mentions v-model:value="searchModel" :placeholder="t('clipSearchPlaceholder')">
          <a-mentions-option value="title">{{ t('clipSearchOptionTitle') }}</a-mentions-option>
          <a-mentions-option value="website">{{ t('clipSearchOptionWebsite') }}</a-mentions-option>
          <a-mentions-option value="content">{{ t('clipSearchOptionContent') }}</a-mentions-option>
        </a-mentions>
      </div>
      <div class="clip-toolbar__actions">
        <div class="clip-toolbar__stat">
          <div class="clip-toolbar__stat-value">{{ total }}</div>
          <div class="clip-toolbar__stat-label">{{ t('clipTotalCount') }}</div>
        </div>
        <a-button size="small" type="default" @click="$emit('refresh')">{{ t('clipRefreshButton') }}</a-button>
      </div>
    </div>
    <div class="clip-toolbar__row clip-toolbar__row--filters">
      <span class="clip-toolbar__filter-label">{{ t('clipClassificationLabel') }}</span>
      <a-radio-group
        v-model:value="classificationModel"
        button-style="solid"
        size="small"
        class="clip-toolbar__classification"
      >
        <a-radio-button value="none">{{ t('clipClassificationNone') }}</a-radio-button>
        <a-radio-button value="domain">{{ t('clipClassificationDomain') }}</a-radio-button>
        <a-radio-button value="date">{{ t('clipClassificationDate') }}</a-radio-button>
      </a-radio-group>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

type ClassificationMode = 'none' | 'domain' | 'date';

const props = defineProps<{
  searchValue: string;
  classificationMode: ClassificationMode;
  total: number;
}>();

const emit = defineEmits<{
  (e: 'update:searchValue', value: string): void;
  (e: 'update:classificationMode', value: ClassificationMode): void;
  (e: 'refresh'): void;
}>();

const searchModel = computed({
  get: () => props.searchValue,
  set: value => emit('update:searchValue', value)
});

const classificationModel = computed({
  get: () => props.classificationMode,
  set: value => emit('update:classificationMode', value as ClassificationMode)
});
</script>

<style scoped>
.clip-toolbar {
  width: 100%;
  border-radius: 12px;
}

.clip-toolbar__row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.clip-toolbar__row + .clip-toolbar__row {
  margin-top: 12px;
}

.clip-toolbar__row--filters {
  justify-content: space-between;
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}

.clip-toolbar__search {
  flex: 1;
  min-width: 240px;
}

.clip-toolbar__search :deep(.ant-mentions) {
  width: 100%;
}

.clip-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.clip-toolbar__stat {
  text-align: right;
  min-width: 90px;
}

.clip-toolbar__stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.clip-toolbar__stat-label {
  font-size: 12px;
  color: #8c8c8c;
}

.clip-toolbar__filter-label {
  font-size: 13px;
  color: #8c8c8c;
}

.clip-toolbar__classification {
  display: flex;
  flex: 1;
  min-width: 220px;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .clip-toolbar__actions {
    width: 100%;
    justify-content: space-between;
  }

  .clip-toolbar__classification {
    justify-content: flex-start;
  }
}
</style>
