<template>
  <div class="tab-section">
    <a-typography-title :level="5">{{ texts.basicSettingsTitle }}</a-typography-title>
    <a-typography-text type="secondary">
      {{ texts.basicSettingsDescription }}
    </a-typography-text>
    <a-divider />
    <a-form layout="vertical" class="settings-form" :model="form">
      <a-form-item :label="texts.displayLanguage">
        <a-select
          v-model:value="form.language"
          :options="languageOptions"
          style="width: 280px;"
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

        <a-divider />

        <div class="toggle-row">
          <div>
            <div class="toggle-row__title">{{ texts.aiSummaryEnabled }}</div>
            <div class="toggle-row__desc">{{ texts.aiSummaryEnabledDescription }}</div>
          </div>
          <a-switch v-model:checked="form.aiSummaryEnabled" />
        </div>

        <!-- AI配置区域 -->
        <div v-if="form.aiSummaryEnabled" class="ai-config-section">
          <a-form layout="vertical">
            <a-form-item :label="texts.aiProviderLabel || 'AI 模型'" style="margin-bottom: 16px;">
              <a-select
                v-model:value="form.aiProvider"
                style="width: 280px;"
              >
                <a-select-option value="qwen">{{ texts.aiProviderQwen }}</a-select-option>
                <a-select-option value="deepseek">{{ texts.aiProviderDeepseek }}</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item :label="texts.aiSummaryApiKeyLabel || 'API Key'" style="margin-bottom: 16px;">
              <a-input
                v-model:value="form.aiSummaryApiKey"
                :placeholder="texts.aiSummaryApiKeyPlaceholder"
                type="password"
                style="width: 100%;"
              />
            </a-form-item>

            <a-form-item style="margin-bottom: 0;">
              <a-button
                type="primary"
                :loading="testingApiKey"
                @click="handleTestApiKey"
                class="test-button"
              >
                {{ texts.aiTestButton }}
              </a-button>
            </a-form-item>
          </a-form>
        </div>
      </a-space>


    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { OptionsForm, LanguageOption } from './types';

const { t } = useI18n();

defineProps<{
  form: OptionsForm;
  languageOptions: LanguageOption[];
  highlightColorOptions: Array<{ label: string; value: string; hex: string }>;
  texts: Record<string, string>;
}>();

const testingApiKey = ref(false);

/**
 * 测试 API Key 的有效性
 */
async function handleTestApiKey() {
  testingApiKey.value = true;
  try {
    // TODO: 实现实际的 API 调用验证逻辑
    await new Promise(resolve => setTimeout(resolve, 1500));
    message.success(t('aiTestSuccess'));
  } catch (error) {
    message.error(t('aiTestFailed'));
  } finally {
    testingApiKey.value = false;
  }
}
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

.ai-config-section {
  margin-top: 16px;
  padding: 20px 0;
}

.test-button {
  background-color: #52c41a;
  border-color: #52c41a;
  min-width: 120px;
}

.test-button:hover {
  background-color: #73d13d;
  border-color: #73d13d;
}

.test-button:focus {
  background-color: #73d13d;
  border-color: #73d13d;
}
</style>
