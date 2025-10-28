<template>
  <n-config-provider :theme="themeObject" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <div class="options">
        <n-card :bordered="false" size="small" :style="{ boxShadow: 'none' }">
          <template #header>
            <n-text strong style="font-size: 18px;">{{ t('title') }}</n-text>
          </template>
          <n-space vertical size="large">
            <n-card size="small">
              <template #header>
                <n-text strong>{{ t('general') }}</n-text>
              </template>
              <n-form :model="form" label-width="140">
                <n-form-item :label="t('displayLanguage')">
                  <n-select v-model:value="form.language" :options="languageOptions" />
                </n-form-item>
                <n-form-item :label="t('theme')">
                  <n-radio-group v-model:value="form.theme">
                    <n-radio-button value="light">{{ t('light') }}</n-radio-button>
                    <n-radio-button value="dark">{{ t('dark') }}</n-radio-button>
                  </n-radio-group>
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
              <n-button type="primary" :loading="saving" @click="handleSave">{{ t('save') }}</n-button>
            </n-space>
          </n-space>
        </n-card>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import {
  NButton,
  NCard,
  NConfigProvider,
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
  useMessage,
  darkTheme,
  zhCN,
  dateZhCN
} from 'naive-ui';
import { isChromeExtensionEnv } from '@/utils/chrome';

interface OptionsForm {
  enableSync: boolean;
  endpoint: string;
  hotkey: string;
  language: 'zh-CN';
  theme: 'light' | 'dark';
}

type StoredOptions = Omit<OptionsForm, 'language'> & { language?: string };

const STORAGE_KEY = 'clipsey-options';
const DEFAULT_OPTIONS: OptionsForm = {
  enableSync: false,
  endpoint: '',
  hotkey: '',
  language: 'zh-CN',
  theme: 'light'
};

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });

const saving = ref(false);
const message = useMessage();
const chromeEnv = isChromeExtensionEnv();

const languageOptions = [{ label: '简体中文', value: 'zh-CN' }];

const naiveLocale = zhCN;
const naiveDateLocale = dateZhCN;
const themeObject = computed(() => (form.theme === 'dark' ? darkTheme : null));

const texts = {
  title: 'Clipsey 设置',
  general: '通用',
  displayLanguage: '界面语言',
  theme: '主题',
  light: '浅色',
  dark: '深色',
  sync: '云同步',
  enableSync: '启用云同步',
  endpoint: '同步地址',
  endpointPlaceholder: '请输入同步接口地址',
  hotkey: '快捷键',
  hotkeyPlaceholder: '例如：Ctrl+Shift+Y',
  save: '保存',
  saved: '设置已保存'
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
    theme: (current.theme ?? legacy.theme ?? DEFAULT_OPTIONS.theme) as OptionsForm['theme']
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
    message.error(`保存失败：${(error as Error).message}`);
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
  min-width: 560px;
  padding: 24px;
  background: #fff;
}
</style>
