<template>
  <a-config-provider>
    <a-card :bordered="false" size="small">
      <a-tabs v-model:activeKey="activeItem">
        <a-tab-pane key="basic" :tab="t('menuBasic')">
          <a-row :gutter="[16, 16]">
            <a-col :xs="24" :md="12">
              <a-card size="small">
                <a-form layout="horizontal" :labelCol="{ span: 8 }" :wrapperCol="{ span: 16 }">
                  <a-form-item :label="t('displayLanguage')">
                    <a-select v-model:value="form.language" :options="languageOptions" />
                  </a-form-item>
                </a-form>
              </a-card>
            </a-col>

            <a-col :xs="24" :md="12">
              <a-card size="small">
                <a-form layout="horizontal" :labelCol="{ span: 8 }" :wrapperCol="{ span: 16 }">
                  <a-form-item :label="t('highlightColor')">
                    <!-- Ant Design Vue 暂无内置颜色选择器，改用输入框维护十六进制颜色值，保持功能一致 -->
                    <a-input v-model:value="form.highlightColor" placeholder="#ff0000" />
                  </a-form-item>
                  <a-form-item :label="t('autoHighlightPageSummary')">
                    <a-switch v-model:checked="form.autoHighlightPageSummary" />
                  </a-form-item>
                  <a-form-item :label="t('autoLocateFirstSummary')">
                    <a-switch v-model:checked="form.autoLocateFirstSummary" />
                  </a-form-item>
                </a-form>
              </a-card>
            </a-col>
          </a-row>
        </a-tab-pane>

        <a-tab-pane key="content" :tab="t('menuContent')">
          <ClipManager />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue';
import ClipManager from './ClipManager.vue';
import { readSettingsValue, writeSettingsValue } from '@/background/settings-store';
// Ant Design Vue 组件通过全局注册使用，无需逐一导入

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


// 使用 Ant Design Vue 全局 message（如需）

const activeItem = ref<'basic' | 'content'>('basic');

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English', value: 'en-US' },
];

// Ant Design Vue 的 locale 暂不使用（当前页面未涉及日期等组件），后续如需要可在 ConfigProvider 中配置。

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
  // 优先从 URL 或本地存储恢复上次访问的标签页，确保刷新后仍停留在“内容管理”等当前页面
  const initial = restoreActiveTabFromUrl() ?? restoreActiveTabFromStorage() ?? 'basic';
  activeItem.value = initial;

  // 监听标签页变化，同步到 URL 与本地存储，保证刷新后定位当前页面
  watch(activeItem, (val) => {
    persistActiveTabToUrl(val);
    persistActiveTabToStorage(val);
  }, { immediate: true });

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

// ---------------- 路由状态保持：刷新后仍停留在当前标签页 ----------------
const TAB_PARAM = 'tab';
const ACTIVE_TAB_KEY = 'options.activeTab';

function isValidTab(tab: string | null | undefined): tab is 'basic' | 'content' {
  return tab === 'basic' || tab === 'content';
}

function restoreActiveTabFromUrl(): 'basic' | 'content' | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get(TAB_PARAM);
    if (isValidTab(fromQuery)) return fromQuery;
    // 兼容 hash 方式：#tab=content
    if (url.hash) {
      const hash = url.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const fromHash = params.get(TAB_PARAM);
      if (isValidTab(fromHash)) return fromHash;
    }
  } catch {}
  return null;
}

function persistActiveTabToUrl(tab: 'basic' | 'content'): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(TAB_PARAM, tab);
    // 使用 replaceState 避免污染历史栈，刷新时浏览器会保留当前 URL
    window.history.replaceState(null, '', url.toString());
  } catch {}
}

function restoreActiveTabFromStorage(): 'basic' | 'content' | null {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (isValidTab(saved)) return saved;
  } catch {}
  return null;
}

function persistActiveTabToStorage(tab: 'basic' | 'content'): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {}
}
</script>
