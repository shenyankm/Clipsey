<template>
  <div class="tab-section">
    <a-typography-title :level="5">{{ texts.basicSettingsTitle }}</a-typography-title>
    <a-typography-text type="secondary">
      {{ texts.basicSettingsDescription }}
    </a-typography-text>
    <a-divider />
    <a-form layout="vertical" class="settings-form">
      <a-form-item :label="texts.displayLanguage">
        <a-select
          v-model:value="form.language"
          :options="languageOptions"
          style="width: 280px;"
          disabled
        />
      </a-form-item>

      <a-form-item :label="texts.highlightColor">
        <a-select v-model:value="form.highlightColor" :options="highlightColorOptions" style="width: 280px;">
          <template #option="{ label, hex }">
            <div class="color-option">
              <span class="color-preview" :style="{ backgroundColor: hex }"></span>
              <span>{{ label }}</span>
            </div>
          </template>
        </a-select>
      </a-form-item>

      <a-divider />

      <a-space direction="vertical" size="large" style="width: 100%;">
        <div class="toggle-row">
          <div>
            <div class="toggle-row__title">{{ texts.autoHighlightPageSummary }}</div>
            <div class="toggle-row__desc">{{ texts.autoHighlightPageSummaryDescription }}</div>
          </div>
          <a-switch v-model:checked="form.autoHighlightPageSummary" />
        </div>

        <div class="toggle-row">
          <div>
            <div class="toggle-row__title">{{ texts.autoLocateFirstSummary }}</div>
            <div class="toggle-row__desc">{{ texts.autoLocateFirstSummaryDescription }}</div>
          </div>
          <a-switch v-model:checked="form.autoLocateFirstSummary" />
        </div>
      </a-space>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import type { OptionsForm, LanguageOption } from './types';

defineProps<{
  form: OptionsForm;
  languageOptions: LanguageOption[];
  highlightColorOptions: Array<{ label: string; value: string; hex: string }>;
  texts: Record<string, string>;
}>();
</script>

<style scoped>
.tab-section {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
}

.color-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-preview {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-block;
  opacity: 0.8;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.toggle-row__title {
  font-weight: 500;
}

.toggle-row__desc {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 4px;
}
</style>
