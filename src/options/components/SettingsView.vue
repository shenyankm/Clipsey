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
                      <template #header>
                        <n-text strong>{{ t('general') }}</n-text>
                      </template>
                      <n-form :model="form" label-width="140">
                        <n-form-item :label="t('displayLanguage')">
                          <n-select v-model:value="form.language" :options="languageOptions" />
                        </n-form-item>
                      </n-form>
                    </n-card>

                    <n-card size="small">
                      <template #header>
                        <n-text strong>{{ t('sync') }}</n-text>
                      </template>
                      <n-form :model="form" label-width="140">
                        <n-form-item :label="t('enableSync')">
                          <n-switch v-model:value="form.enableSync" />
                        </n-form-item>
                        <n-form-item :label="t('endpoint')">
                          <n-input
                            v-model:value="form.endpoint"
                            :placeholder="t('endpointPlaceholder')"
                            :disabled="!form.enableSync"
                          />
                        </n-form-item>
                        <n-form-item :label="t('hotkey')">
                          <n-input v-model:value="form.hotkey" :placeholder="t('hotkeyPlaceholder')" />
                        </n-form-item>
                      </n-form>
                    </n-card>

                    <n-space justify="end">
                      <n-button type="primary" :loading="saving" @click="handleSave">
                        {{ t('save') }}
                      </n-button>
                    </n-space>
                  </n-space>
                </n-tab-pane>
                <n-tab-pane name="content" :tab="t('menuContent')">
                  <ClipManager />
                </n-tab-pane>
                <n-tab-pane name="guide" :tab="t('menuGuide')">
                  <n-space vertical size="large">
                    <n-card size="small" :bordered="false">
                      <n-space vertical size="medium">
                        <n-text strong>{{ t('usageGuideTitle') }}</n-text>
                        <n-text depth="3">{{ t('usageGuideIntro') }}</n-text>
                        <n-space vertical size="small" class="guide-steps">
                          <n-text>1. {{ t('usageGuideStepClip') }}</n-text>
                          <n-text>2. {{ t('usageGuideStepManage') }}</n-text>
                          <n-text>3. {{ t('usageGuideStepSync') }}</n-text>
                        </n-space>
                        <n-button type="primary" ghost>{{ t('usageGuideMore') }}</n-button>
                      </n-space>
                    </n-card>
                  </n-space>
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
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NText,
  NTabs,
  NTabPane,
  useMessage,
  darkTheme,
  zhCN,
  dateZhCN
} from 'naive-ui';
import ClipManager from './ClipManager.vue';
import { isChromeExtensionEnv } from '@/utils/chrome';

interface OptionsForm {
  enableSync: boolean;
  endpoint: string;
  hotkey: string;
  language: 'zh-CN';
}

type StoredOptions = Omit<OptionsForm, 'language'> & { language?: string };

const STORAGE_KEY = 'clipsey-options';
const DEFAULT_OPTIONS: OptionsForm = {
  enableSync: false,
  endpoint: '',
  hotkey: '',
  language: 'zh-CN',
};

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });

const saving = ref(false);
const message = useMessage();
const chromeEnv = isChromeExtensionEnv();

const activeItem = ref<'basic' | 'content' | 'guide'>('basic');

const languageOptions = [{ label: '简体中文', value: 'zh-CN' }];

const naiveLocale = zhCN;
const naiveDateLocale = dateZhCN;
const themeObject = computed(() => null);

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '内容管理',
  menuGuide: '使用教程',
  general: '基础配置',
  displayLanguage: '显示语言',
  sync: '同步设置',
  enableSync: '启用同步',
  endpoint: '同步地址',
  endpointPlaceholder: '请输入同步接口地址',
  hotkey: '快捷键',
  hotkeyPlaceholder: '例如：Ctrl+Shift+Y',
  save: '保存',
  saved: '设置已保存',
  saveError: '保存失败：',
  contentManagerTitle: '内容管理',
  contentManagerDescription: '管理剪辑内容的保存策略和存储空间。',
  contentManagerSync: '同步与备份',
  contentManagerSyncDescription: '开启同步后，可在多端统一管理收藏内容，并保持收藏记录一致。',
  contentManagerTips: '更多内容管理功能正在规划中，敬请期待。',
  usageGuideTitle: '使用教程',
  usageGuideIntro: '快速上手 Clipsey 的三步指南：',
  usageGuideStepClip: '使用快捷键或右键菜单保存网页内容。',
  usageGuideStepManage: '在“内容管理”中快速检索、整理已保存的素材。',
  usageGuideStepSync: '开启同步，在多设备之间保持剪辑内容一致。',
  usageGuideMore: '查看详细教程'
} as const;

type TextKey = keyof typeof texts;

function t(key: TextKey) {
  return texts[key];
}

function mergeStoredOptions(
  current: Partial<StoredOptions> = {},
  legacy: Partial<StoredOptions> = {}
): OptionsForm {
  return {
    enableSync: current.enableSync ?? legacy.enableSync ?? DEFAULT_OPTIONS.enableSync,
    endpoint: current.endpoint ?? legacy.endpoint ?? DEFAULT_OPTIONS.endpoint,
    hotkey: current.hotkey ?? legacy.hotkey ?? DEFAULT_OPTIONS.hotkey,
    language: 'zh-CN',
  };
}

onMounted(async () => {
  const stored = await getSettings();
  Object.assign(form, stored);
});

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    if (chromeEnv && chrome.storage?.sync) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: { ...form } });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form }));
    }
    message.success(t('saved'));
  } catch (error) {
    message.error(`${t('saveError')}${(error as Error).message}`);
  } finally {
    saving.value = false;
  }
}

async function getSettings(): Promise<OptionsForm> {
  if (chromeEnv && chrome.storage?.sync) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.get([STORAGE_KEY, 'page-clipper-options'], result => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          const legacy = (result['page-clipper-options'] ?? {}) as Partial<StoredOptions>;
          const current = (result[STORAGE_KEY] ?? {}) as Partial<StoredOptions>;
          resolve(mergeStoredOptions(current, legacy));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  return loadSettingsFromLocal();
}

function loadSettingsFromLocal(): OptionsForm {
  try {
    const rawCurrent = localStorage.getItem(STORAGE_KEY);
    const rawLegacy = localStorage.getItem('page-clipper-options');
    const legacy = (rawLegacy ? JSON.parse(rawLegacy) : {}) as Partial<StoredOptions>;
    const current = (rawCurrent ? JSON.parse(rawCurrent) : {}) as Partial<StoredOptions>;
    return mergeStoredOptions(current, legacy);
  } catch {
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
