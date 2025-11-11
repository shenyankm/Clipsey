<template>
  <a-config-provider>
    <a-card :bordered="false" class="settings-card">
      <a-tabs v-model:activeKey="activeItem">
        <a-tab-pane key="basic" :tab="t('menuBasic')">
          <div class="tab-section">
            <a-typography-title :level="5">{{ t('basicSettingsTitle') }}</a-typography-title>
            <a-typography-text type="secondary">
              {{ t('basicSettingsDescription') }}
            </a-typography-text>
            <a-divider />
            <a-form layout="vertical" class="settings-form">
              <a-form-item :label="t('displayLanguage')">
                <a-select 
                  v-model:value="form.language" 
                  :options="languageOptions" 
                  style="width: 280px;"
                  disabled
                />
              </a-form-item>
              
              <a-form-item :label="t('highlightColor')">
                <a-select 
                  v-model:value="form.highlightColor" 
                  :options="highlightColorOptions" 
                  style="width: 280px;"
                >
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
                    <div class="toggle-row__title">{{ t('autoHighlightPageSummary') }}</div>
                    <div class="toggle-row__desc">{{ t('autoHighlightPageSummaryDescription') }}</div>
                  </div>
                  <a-switch v-model:checked="form.autoHighlightPageSummary" />
                </div>
                
                <div class="toggle-row">
                  <div>
                    <div class="toggle-row__title">{{ t('autoLocateFirstSummary') }}</div>
                    <div class="toggle-row__desc">{{ t('autoLocateFirstSummaryDescription') }}</div>
                  </div>
                  <a-switch v-model:checked="form.autoLocateFirstSummary" />
                </div>
              </a-space>
            </a-form>
          </div>
        </a-tab-pane>

        <a-tab-pane key="content" :tab="t('menuContent')">
          <div class="tab-section">
            <ClipManager />
          </div>
        </a-tab-pane>

        <a-tab-pane key="about" :tab="t('menuAbout')">
          <div class="tab-section about-section">
            <div class="about-hero">
              <InfoCircleOutlined class="about-hero__icon" />
              <div>
                <a-typography-title :level="5">{{ t('aboutTitle') }}</a-typography-title>
                <a-typography-text type="secondary">{{ t('aboutDescription') }}</a-typography-text>
              </div>
            </div>
            <a-divider />
            <div class="about-block">
              <a-typography-text strong>{{ t('contactEmailLabel') }}</a-typography-text>
              <a href="mailto:support@clipsey.app" class="contact-link">
                <MailOutlined />
                <span>support@clipsey.app</span>
              </a>
            </div>
            <div class="about-block">
              <a-typography-text strong>{{ t('communityLabel') }}</a-typography-text>
              <a-space direction="vertical" size="middle">
                <div
                  v-for="item in communityLinks"
                  :key="item.label"
                  class="contact-row"
                >
                  <component :is="item.icon" class="contact-row__icon" />
                  <div>
                    <div class="contact-row__label">{{ item.label }}</div>
                    <a-typography-text>{{ item.value }}</a-typography-text>
                  </div>
                </div>
              </a-space>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch, type Component } from 'vue';
import ClipManager from './ClipManager.vue';
import { readSettingsLocal, writeSettingsLocal } from '@/utils/settings-local';
import { MailOutlined, QqOutlined, WechatOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';

interface OptionsForm {
  language: 'zh-CN';
  highlightColor: 'amber' | 'green' | 'blue';
  autoHighlightPageSummary: boolean;
  autoLocateFirstSummary: boolean;
}

type StoredOptions = Omit<OptionsForm, 'language'> & { language?: string };

type TabKey = 'basic' | 'content' | 'about';

type CommunityContact = {
  label: string;
  value: string;
  icon: Component;
};

const DEFAULT_OPTIONS: OptionsForm = {
  language: 'zh-CN',
  highlightColor: 'amber',
  autoHighlightPageSummary: true,
  autoLocateFirstSummary: true,
};

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });
const activeItem = ref<TabKey>('basic');

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
];

const highlightColorOptions = [
  { label: '琥珀色', value: 'amber', hex: '#FFC107' },
  { label: '青草绿', value: 'green', hex: '#81C784' },
  { label: '湖水蓝', value: 'blue', hex: '#64B5F6' },
];

const communityLinks: CommunityContact[] = [
  { label: 'QQ 交流群', value: '123456789', icon: QqOutlined },
  { label: '微信群', value: 'Clipsey好友群', icon: WechatOutlined }
];

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '摘要管理',
  menuAbout: '关于 Clipsey',
  displayLanguage: '界面语言',
  highlightColor: '高亮主题色',
  languageZhCN: '简体中文',
  autoHighlightPageSummary: '自动高亮页面摘要',
  autoHighlightPageSummaryDescription: '打开含有已保存摘要的页面时自动恢复高亮，便于浏览定位。',
  autoLocateFirstSummary: '进入页面时定位首条摘要',
  autoLocateFirstSummaryDescription: '进入页面后立即滚动并定位到第一条摘要，减少手动查找。',
  basicSettingsTitle: '通用偏好',
  basicSettingsDescription: '在此配置界面语言、主题色以及自动高亮体验，提升日常使用效率。',
  aboutTitle: '关于 Clipsey',
  aboutDescription: 'Clipsey 是一款专注网页摘录与回溯的浏览器扩展，帮助你快速保存灵感、同步高亮并一键定位原文。',
  contactEmailLabel: '联系邮箱',
  communityLabel: '交流群'
};

type TextKey = keyof typeof texts;

function t(key: TextKey) {
  return texts[key];
}

function mergeStoredOptions(current: Partial<StoredOptions> = {}): OptionsForm {
  const mergedOptions: OptionsForm = { ...DEFAULT_OPTIONS };
  if (current.highlightColor !== undefined) {
    mergedOptions.highlightColor = current.highlightColor as OptionsForm['highlightColor'];
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
  const initial = restoreActiveTabFromUrl() ?? restoreActiveTabFromStorage() ?? 'basic';
  activeItem.value = initial;

  watch(activeItem, (val) => {
    persistActiveTabToUrl(val);
    persistActiveTabToStorage(val);
  }, { immediate: true });

  const stored = await getSettings();
  Object.assign(form, stored);
});

async function getSettings(): Promise<OptionsForm> {
  try {
    const stored = await readSettingsLocal();
    return mergeStoredOptions(stored ?? {} as Partial<StoredOptions>);
  } catch (error) {
    console.warn('Failed to load settings from IndexedDB:', error);
    return { ...DEFAULT_OPTIONS };
  }
}

const TAB_PARAM = 'tab';
const ACTIVE_TAB_KEY = 'options.activeTab';

function isValidTab(tab: string | null | undefined): tab is TabKey {
  return tab === 'basic' || tab === 'content' || tab === 'about';
}

function restoreActiveTabFromUrl(): TabKey | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get(TAB_PARAM);
    if (isValidTab(fromQuery)) return fromQuery;
    if (url.hash) {
      const hash = url.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const fromHash = params.get(TAB_PARAM);
      if (isValidTab(fromHash)) return fromHash;
    }
  } catch {}
  return null;
}

function persistActiveTabToUrl(tab: TabKey): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(TAB_PARAM, tab);
    window.history.replaceState(null, '', url.toString());
  } catch {}
}

function restoreActiveTabFromStorage(): TabKey | null {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (isValidTab(saved)) return saved;
  } catch {}
  return null;
}

function persistActiveTabToStorage(tab: TabKey): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {}
}

watch(
  () => [form.highlightColor, form.autoHighlightPageSummary, form.autoLocateFirstSummary],
  async () => {
    try {
      await writeSettingsLocal({
        highlightColor: form.highlightColor,
        autoHighlightPageSummary: form.autoHighlightPageSummary,
        autoLocateFirstSummary: form.autoLocateFirstSummary,
      });
    } catch (error) {
      console.warn('Failed to save settings:', error);
    }
  },
  { deep: true }
);
</script>

<style scoped>
.settings-card {
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
}

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

.about-hero {
  display: flex;
  align-items: center;
  gap: 12px;
}

.about-hero__icon {
  font-size: 28px;
  color: #1677ff;
}

.about-block + .about-block {
  margin-top: 16px;
}

.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1677ff;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.contact-row__icon {
  font-size: 20px;
  color: #1677ff;
}

.contact-row__label {
  font-weight: 500;
}
</style>
