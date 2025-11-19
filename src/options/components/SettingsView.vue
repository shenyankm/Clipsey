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
          <div style="padding: 16px;">
            <ClipManager />
          </div>
        </a-tab-pane>

        <a-tab-pane key="about" :tab="t('menuAbout')">
          <AboutSection
            :texts="aboutTexts"
            :contact-email="contactEmail"
            :community-links="communityLinks"
          />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </a-config-provider>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, reactive, ref, watch, computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();

const ClipManager = defineAsyncComponent({
  loader: () => import('./ClipManager.vue'),
  loadingComponent: {
    template: '<a-spin size="large" style="display: flex; justify-content: center; padding: 48px;" />'
  },
  errorComponent: {
    template: '<a-alert message="加载失败" description="无法加载摘要管理组件，请刷新页面重试" type="error" show-icon />'
  },
  delay: 200,
  timeout: 10000
});

type TabKey = 'basic' | 'content' | 'about';

type CommunityContact = {
  label: string;
  value: string;
  icon: Component;
};

const DEFAULT_OPTIONS: OptionsForm = createOptionsForm(DEFAULT_SETTINGS);

const form = reactive<OptionsForm>({ ...DEFAULT_OPTIONS });
const activeItem = ref<TabKey>('basic');

const languageOptions = computed(() => [
  { label: t('languageZhCN'), value: 'zh-CN' },
  { label: t('languageEnUS'), value: 'en-US' },
]);

const texts = computed(() => ({
  displayLanguage: t('displayLanguage'),
  highlightColor: t('highlightColor'),
  autoHighlightPageSummary: t('autoHighlightPageSummary'),
  autoHighlightPageSummaryDescription: t('autoHighlightPageSummaryDescription'),
  autoLocateFirstSummary: t('autoLocateFirstSummary'),
  autoLocateFirstSummaryDescription: t('autoLocateFirstSummaryDescription'),
  basicSettingsTitle: t('basicSettingsTitle'),
  basicSettingsDescription: t('basicSettingsDescription'),
  // aiSummaryEnabled: t('aiSummaryEnabled'),
  // aiSummaryEnabledDescription: t('aiSummaryEnabledDescription'),
  // aiProviderLabel: t('aiProviderLabel'),
  // aiProvider: t('aiProvider'),
  // aiProviderQwen: t('aiProviderQwen'),
  // aiProviderDeepseek: t('aiProviderDeepseek'),
  // aiSummaryApiKeyLabel: t('aiSummaryApiKeyLabel'),
  // aiSummaryApiKey: t('aiSummaryApiKey'),
  // aiSummaryApiKeyPlaceholder: t('aiSummaryApiKeyPlaceholder'),
  // aiTestButton: t('aiTestButton'),
  // aiTestSuccess: t('aiTestSuccess'),
  // aiTestFailed: t('aiTestFailed'),
  // aiTesting: t('aiTesting'),
}));

const aboutTexts = computed(() => ({
  aboutTitle: t('aboutTitle'),
  aboutDescription: t('aboutDescription'),
  contactEmailLabel: t('contactEmailLabel'),
  communityLabel: t('communityLabel'),
}));

const highlightColorOptions = computed(() => 
  HIGHLIGHT_COLOR_OPTIONS.map(option => ({
    ...option,
    label: t(option.label)
  }))
);

const contactEmail = 'shenyankm@gmail.com';

const communityLinks: CommunityContact[] = [
  { label: 'QQ 交流群', value: '2155061751', icon: QqOutlined }
];

function createOptionsForm(current?: Partial<SettingsOptions>): OptionsForm {
  const base: OptionsForm = {
    language: DEFAULT_SETTINGS.language,
    highlightColor: DEFAULT_SETTINGS.highlightColor,
    autoHighlightPageSummary: DEFAULT_SETTINGS.autoHighlightPageSummary,
    autoLocateFirstSummary: DEFAULT_SETTINGS.autoLocateFirstSummary,
    // aiSummaryEnabled: DEFAULT_SETTINGS.aiSummaryEnabled,
    // aiProvider: DEFAULT_SETTINGS.aiProvider,
    // aiSummaryApiKey: DEFAULT_SETTINGS.aiSummaryApiKey,
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
  // if (typeof current.aiSummaryEnabled === 'boolean') {
  //   merged.aiSummaryEnabled = current.aiSummaryEnabled;
  // }
  // if (current.aiProvider) {
  //   merged.aiProvider = current.aiProvider;
  // }
  // if (typeof current.aiSummaryApiKey === 'string') {
  //   merged.aiSummaryApiKey = current.aiSummaryApiKey;
  // }
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
  () => [form.language, form.highlightColor, form.autoHighlightPageSummary, form.autoLocateFirstSummary], // Removed AI summary fields
  async () => {
    try {
      await writeSettingsLocal({
        language: form.language,
        highlightColor: form.highlightColor,
        autoHighlightPageSummary: form.autoHighlightPageSummary,
        autoLocateFirstSummary: form.autoLocateFirstSummary,
        // aiSummaryEnabled: form.aiSummaryEnabled,
        // aiProvider: form.aiProvider,
        // aiSummaryApiKey: form.aiSummaryApiKey,
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
