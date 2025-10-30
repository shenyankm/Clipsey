<template>
  <n-config-provider :theme="themeObject" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <div class="options">
        <n-grid :cols="6" :x-gap="24">
          <n-gi :span="24">
            <n-card :bordered="false" size="small" :style="{ boxShadow: 'none' }" :content-style="{ padding: '0' }">
              <n-tabs v-model:value="activeItem" type="line" animated class="settings-tabs">
                <n-tab-pane name="basic" :tab="t('menuBasic')">
                  <n-space vertical size="large">
                    <n-card size="small">

                      <n-form :model="form">
                        <n-form-item :label="t('displayLanguage')">
                          <n-select v-model:value="form.language" :options="languageOptions" />
                        </n-form-item>
                      </n-form>
                    </n-card>

                    <n-card size="small">
                      <template #header>
                        {{ t('highlightColor') }}
                      </template>
                      <n-color-picker v-model:value="form.highlightColor" :show-alpha="false" />
                      <n-form-item :label="t('autoHighlightPageSummary')">
                        <n-switch v-model:value="form.autoHighlightPageSummary" />
                      </n-form-item>
                      <n-form-item :label="t('autoLocateFirstSummary')">
                        <n-switch v-model:value="form.autoLocateFirstSummary" />
                      </n-form-item>
                    </n-card>
                  </n-space>
                </n-tab-pane>
                <n-tab-pane name="content" :tab="t('menuContent')">
                  <ClipManager />
                </n-tab-pane>

              </n-tabs>
            </n-card>
          </n-gi>
        </n-grid>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref, computed } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NGi,
  NGrid,
  NMessageProvider,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NSwitch,
  NText,
  NTabs,
  NTabPane,
  NColorPicker,
  useMessage,
  darkTheme,
  zhCN,
  dateZhCN,
  enUS,
  dateEnUS
} from 'naive-ui';
import ClipManager from './ClipManager.vue';
import { readSettingsValue, writeSettingsValue } from '@/background/settings-store';

interface OptionsForm {

  language: 'zh-CN' | 'zh-TW' | 'en-US';
  highlightColor: string;
  autoHighlightPageSummary: boolean;
  autoLocateFirstSummary: boolean;
}

type StoredOptions = Omit<OptionsForm, 'language'> & { language?: string };

const DEFAULT_OPTIONS: OptionsForm = {

  language: 'zh-CN',
  highlightColor: '#f00',
  autoHighlightPageSummary: true,
  autoLocateFirstSummary: true,
};

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });


const message = useMessage();

const activeItem = ref<'basic' | 'content'>('basic');

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English', value: 'en-US' },
];

const naiveLocale = computed(() => {
  if (form.language === 'zh-CN' || form.language === 'zh-TW') {
    return zhCN;
  } else if (form.language === 'en-US') {
    return enUS;
  }
  return zhCN; // Default to zhCN
});

const naiveDateLocale = computed(() => {
  if (form.language === 'zh-CN' || form.language === 'zh-TW') {
    return dateZhCN;
  } else if (form.language === 'en-US') {
    return dateEnUS;
  }
  return dateZhCN; // Default to dateZhCN
});
const themeObject = computed(() => null);

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '内容管理',

  displayLanguage: '显示语言',
  languageZhCN: '简体中文',
  languageZhTW: '繁體中文',
  languageEnUS: 'English',
  highlightColor: '内容高亮',
  highlightColorDescription: '设置内容高亮颜色',
    autoHighlightPageSummary: '页面摘要自动高亮',
    autoHighlightPageSummaryDescription: '自动高亮页面中的摘要内容',
    autoLocateFirstSummary: '自动定位首个摘要位置',
    autoLocateFirstSummaryDescription: '页面加载后自动滚动到第一个摘要位置',

  
  contentManagerTitle: '内容管理',
  contentManagerDescription: '管理剪辑内容的保存策略和存储空间。',
  contentManagerSync: '同步与备份',
  contentManagerSyncDescription: '开启同步后，可在多端统一管理收藏内容，并保持收藏记录一致。',
  contentManagerTips: '更多内容管理功能正在规划中，敬请期待。',
} as const;

type TextKey = keyof typeof texts;

function t(key: TextKey) {
  return texts[key];
}

function mergeStoredOptions(
  current: Partial<StoredOptions> = {},
  legacy: Partial<StoredOptions> = {}
): OptionsForm {
  const mergedOptions: OptionsForm = { ...DEFAULT_OPTIONS };

  if (current.language !== undefined) {
    mergedOptions.language = current.language as OptionsForm['language'];
  }
  if (current.highlightColor !== undefined) {
    mergedOptions.highlightColor = current.highlightColor;
  }
  if (current.autoHighlightPageSummary !== undefined) {
    mergedOptions.autoHighlightPageSummary = current.autoHighlightPageSummary;
  }
  if (current.autoLocateFirstSummary !== undefined) {
    mergedOptions.autoLocateFirstSummary = current.autoLocateFirstSummary;
  }

  return mergedOptions;
}

onMounted(async () => {
  const stored = await getSettings();
  Object.assign(form, stored);
});



async function getSettings(): Promise<OptionsForm> {
  try {
    const stored = await readSettingsValue<Partial<StoredOptions>>();
    return mergeStoredOptions(stored ?? {});
  } catch (error) {
    console.warn('Failed to load settings from IndexedDB:', error);
    return { ...DEFAULT_OPTIONS };
  }
}
</script>

<style scoped>
.options {
  min-height: 100vh;
  padding: 32px 24px;
  background: #f7f8fa;
}

.settings-tabs {
  min-height: 360px;
  padding: 8px 12px;
}

@media (max-width: 768px) {
  .options {
    padding: 16px;
  }
}
</style>
