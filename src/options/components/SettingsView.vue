<template>
  <n-config-provider :theme="themeObject" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <div class="options">
        <n-grid :cols="6" :x-gap="24">
          <n-gi v-if="!isMobile" :span="1" />
          <n-gi :span="isMobile ? 6 : 4">
            <n-card :bordered="false" size="small" :style="{ boxShadow: 'none' }" :content-style="{ padding: '0' }">
              <template #header>
                <n-space justify="space-between" align="center" style="width: 100%">
                  <n-text strong style="font-size: 18px;">{{ t('title') }}</n-text>
                  <n-button
                    v-if="isMobile"
                    quaternary
                    size="medium"
                    aria-label="打开设置项菜单"
                    @click="drawerVisible = true"
                    style="padding: 6px 10px;"
                  >
                    <n-icon>
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      </svg>
                    </n-icon>
                  </n-button>
                </n-space>
              </template>
              <n-grid :cols="isMobile ? 1 : 4" :x-gap="16" class="settings-grid">
                <n-gi v-if="!isMobile" :span="1">
                  <n-card size="small" :bordered="false" class="settings-menu-card">
                    <n-menu v-model:value="activeItem" :options="menuOptions" :root-indent="0" />
                  </n-card>
                </n-gi>
                <n-gi v-if="!isMobile" :span="1" class="settings-divider-wrapper">
                  <n-divider vertical class="settings-divider" />
                </n-gi>
                <n-gi :span="isMobile ? 1 : 2" class="settings-content">
                  <template v-if="activeItem === 'basic'">
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
                        <n-button type="primary" :loading="saving" @click="handleSave">
                          {{ t('save') }}
                        </n-button>
                      </n-space>
                    </n-space>
                  </template>
                  <template v-else-if="activeItem === 'content'">
                    <n-space vertical size="large">
                      <n-card size="small" :bordered="false">
                        <n-space vertical size="small">
                          <n-text strong>{{ t('contentManagerTitle') }}</n-text>
                          <n-text depth="3">{{ t('contentManagerDescription') }}</n-text>
                        </n-space>
                      </n-card>
                      <n-card size="small">
                        <n-space vertical size="small">
                          <n-text strong>{{ t('contentManagerSync') }}</n-text>
                          <n-text depth="3">{{ t('contentManagerSyncDescription') }}</n-text>
                        </n-space>
                      </n-card>
                      <n-alert type="info" :show-icon="false">{{ t('contentManagerTips') }}</n-alert>
                    </n-space>
                  </template>
                  <template v-else>
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
                  </template>
                </n-gi>
              </n-grid>
              <!-- 移动端抽屉菜单 -->
              <n-drawer v-model:show="drawerVisible" placement="left" :width="260" :mask-closable="true">
                <n-drawer-content title="设置项" closable>
                  <n-menu v-model:value="activeItem" :options="menuOptions" :root-indent="0" />
                </n-drawer-content>
              </n-drawer>
            </n-card>
          </n-gi>
          <n-gi v-if="!isMobile" :span="1" />
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
  NDivider,
  NDrawer,
  NDrawerContent,
  NGi,
  NGrid,
  NMenu,
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
import type { MenuOption } from 'naive-ui';
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

const activeItem = ref<'basic' | 'content' | 'guide'>('basic');
const drawerVisible = ref(false);

const isMobile = ref(false);
function updateIsMobile() {
  try {
    isMobile.value = window.innerWidth < 768;
  } catch {
    isMobile.value = false;
  }
}

const languageOptions = [{ label: '简体中文', value: 'zh-CN' }];

const naiveLocale = zhCN;
const naiveDateLocale = dateZhCN;
const themeObject = computed(() => (form.theme === 'dark' ? darkTheme : null));

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '内容管理',
  menuGuide: '使用教程',
  general: '基础配置',
  displayLanguage: '显示语言',
  theme: '主题',
  light: '浅色',
  dark: '深色',
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

const menuOptions = computed<MenuOption[]>(() => [
  { label: t('menuBasic'), key: 'basic' },
  { label: t('menuContent'), key: 'content' },
  { label: t('menuGuide'), key: 'guide' }
]);

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
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
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

.settings-grid {
  min-height: 360px;
  padding: 8px 12px;
}

.settings-menu-card {
  height: 100%;
  padding: 12px 0;
}

.settings-divider-wrapper {
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0 8px;
}

.settings-divider {
  height: 100%;
  border-color: #eaeaea !important;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 4px 12px;
}

.guide-steps {
  line-height: 1.6;
}
</style>
