<template>
  <a-config-provider>
    <a-card :bordered="false" class="settings-card">
      <a-tabs v-model:activeKey="activeItem">
        <a-tab-pane key="basic" :tab="t('menuBasic')">
          <BasicPreferences
            :form="form"
            :language-options="languageOptions"
            :highlight-color-options="highlightColorOptions"
            :texts="texts"
          />
        </a-tab-pane>

        <a-tab-pane key="content" :tab="t('menuContent')">
          <div class="tab-section">
            <ClipManager />
          </div>
        </a-tab-pane>

        <a-tab-pane key="about" :tab="t('menuAbout')">
          <AboutSection
            :texts="texts"
            :contact-email="contactEmail"
            :community-links="communityLinks"
          />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </a-config-provider>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, reactive, ref, watch, type Component } from 'vue';
import BasicPreferences from './settings/BasicPreferences.vue';
import AboutSection from './settings/AboutSection.vue';
import {
  readSettingsLocal,
  writeSettingsLocal,
  DEFAULT_SETTINGS,
  HIGHLIGHT_COLOR_OPTIONS,
  type SettingsOptions,
} from '@/utils/settings-local';
import { QqOutlined } from '@ant-design/icons-vue';
import type { OptionsForm } from './settings/types';

const ClipManager = defineAsyncComponent(() => import('./ClipManager.vue'));

type TabKey = 'basic' | 'content' | 'about';

type CommunityContact = {
  label: string;
  value: string;
  icon: Component;
};

const DEFAULT_OPTIONS: OptionsForm = createOptionsForm(DEFAULT_SETTINGS);

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });
const activeItem = ref<TabKey>('basic');

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
];

const highlightColorOptions = HIGHLIGHT_COLOR_OPTIONS;

const contactEmail = 'shenyankm@gmail.com';

const communityLinks: CommunityContact[] = [
  { label: 'QQ 交流群', value: '2155061751', icon: QqOutlined }
];

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '摘要管理',
  menuAbout: '关于',
  displayLanguage: '界面语言',
  highlightColor: '高亮主题色',
  languageZhCN: '简体中文',
  autoHighlightPageSummary: '自动高亮页面摘要',
  autoHighlightPageSummaryDescription: '打开含有已保存摘要的页面时自动恢复高亮，便于浏览定位。',
  autoLocateFirstSummary: '进入页面时定位最新摘要',
  autoLocateFirstSummaryDescription: '进入页面后自动滚动至最新的一条摘要，快速回到最新内容。',
  basicSettingsTitle: '通用偏好',
  basicSettingsDescription: '在此配置界面语言、主题色以及自动高亮体验，提升日常使用效率。',
  aboutTitle: '关于',
  aboutDescription: 'Clipsey 是一款专注网页摘录与回溯的浏览器扩展，帮助你快速保存灵感、同步高亮并一键定位原文。',
  contactEmailLabel: '联系邮箱',
  communityLabel: '交流群'
};

type TextKey = keyof typeof texts;

function t(key: TextKey) {
  return texts[key];
}

function createOptionsForm(current?: Partial<SettingsOptions>): OptionsForm {
  const base: OptionsForm = {
    language: DEFAULT_SETTINGS.language,
    highlightColor: DEFAULT_SETTINGS.highlightColor,
    autoHighlightPageSummary: DEFAULT_SETTINGS.autoHighlightPageSummary,
    autoLocateFirstSummary: DEFAULT_SETTINGS.autoLocateFirstSummary,
  };
  const merged: OptionsForm = { ...base };
  if (!current) return merged;
  if (current.language) merged.language = current.language;
  if (current.highlightColor) merged.highlightColor = current.highlightColor;
  if (typeof current.autoHighlightPageSummary === 'boolean') {
    merged.autoHighlightPageSummary = current.autoHighlightPageSummary;
  }
  if (typeof current.autoLocateFirstSummary === 'boolean') {
    merged.autoLocateFirstSummary = current.autoLocateFirstSummary;
  }
  return merged;
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
    return createOptionsForm(stored);
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


.community-item__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.community-item__label {
  font-weight: 500;
  color: #000000d9;
  font-size: 14px;
}

.community-item__value {
  font-size: 13px;
  color: #8c8c8c;
}

.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1677ff;
  text-decoration: none;
  transition: color 0.3s ease;
}

.contact-link:hover {
  color: #40a9ff;
  text-decoration: underline;
}

.contact-link__icon {
  font-size: 16px;
}

.about-block + .about-block {
  margin-top: 16px;
}
</style>
