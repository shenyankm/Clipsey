<template>
  <a-config-provider>
    <a-card :bordered="false" size="small">
      <a-tabs v-model:activeKey="activeItem">
        <a-tab-pane key="basic" :tab="t('menuBasic')">
          <a-card size="small" title="基础设置">
            <a-form layout="vertical">
              <a-form-item :label="t('displayLanguage')">
                <a-select 
                  v-model:value="form.language" 
                  :options="languageOptions" 
                  style="width: 280px;"
                />
              </a-form-item>
              
              <a-form-item :label="t('highlightColor')">
                <a-select 
                  v-model:value="form.highlightColor" 
                  :options="highlightColorOptions" 
                  style="width: 280px;"
                >
                  <template #option="{ label, hex }">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span 
                        :style="{ 
                          display: 'inline-block', 
                          width: '16px', 
                          height: '16px', 
                          backgroundColor: hex,
                          borderRadius: '2px',
                          opacity: 0.6
                        }"
                      ></span>
                      <span>{{ label }}</span>
                    </div>
                  </template>
                </a-select>
              </a-form-item>
              
              <a-divider />
              
              <a-form-item>
                <a-space direction="vertical" size="middle" style="width: 100%;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-weight: 500;">{{ t('autoHighlightPageSummary') }}</div>
                      <div style="color: #8c8c8c; font-size: 12px; margin-top: 4px;">{{ t('autoHighlightPageSummaryDescription') }}</div>
                    </div>
                    <a-switch v-model:checked="form.autoHighlightPageSummary" />
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-weight: 500;">{{ t('autoLocateFirstSummary') }}</div>
                      <div style="color: #8c8c8c; font-size: 12px; margin-top: 4px;">{{ t('autoLocateFirstSummaryDescription') }}</div>
                    </div>
                    <a-switch v-model:checked="form.autoLocateFirstSummary" />
                  </div>
                </a-space>
              </a-form-item>
            </a-form>
          </a-card>
        </a-tab-pane>

        <a-tab-pane key="content" :tab="t('menuContent')">
          <ClipManager />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import ClipManager from './ClipManager.vue';
import { readSettingsLocal, writeSettingsLocal } from '@/utils/settings-local';

interface OptionsForm {

  language: 'zh-CN' | 'zh-TW' | 'en-US';
  highlightColor: 'amber' | 'green' | 'blue';
  autoHighlightPageSummary: boolean;
  autoLocateFirstSummary: boolean;
}

type StoredOptions = Omit<OptionsForm, 'language'> & { language?: string };

const DEFAULT_OPTIONS: OptionsForm = {

  language: 'zh-CN',
  highlightColor: 'amber',
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

const highlightColorOptions = [
  { label: '琥珀色', value: 'amber', hex: '#FFC107' },
  { label: '青绿色', value: 'green', hex: '#81C784' },
  { label: '天蓝色', value: 'blue', hex: '#64B5F6' },
];

// Ant Design Vue 的 locale 暂不使用（当前页面未涉及日期等组件），后续如需要可在 ConfigProvider 中配置。

const texts = {
  title: 'Clipsey 设置',
  menuBasic: '基础设置',
  menuContent: '摘要管理',

  displayLanguage: '显示语言',
  highlightColor: '内容高亮颜色',
  languageZhCN: '简体中文',
  languageZhTW: '繁體中文',
  languageEnUS: 'English',

    autoHighlightPageSummary: '页面摘要自动高亮',
    autoHighlightPageSummaryDescription: '自动高亮页面中的摘要内容',
    autoLocateFirstSummary: '定位末端摘要',
    autoLocateFirstSummaryDescription: '自动定位到页面中存在的最后一个摘要位置',

  
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
  current: Partial<StoredOptions> = {}
): OptionsForm {
  const mergedOptions: OptionsForm = { ...DEFAULT_OPTIONS };

  if (current.language !== undefined) {
    mergedOptions.language = current.language as OptionsForm['language'];
  }
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
  // 优先从 URL 或本地存储恢复上次访问的标签页,确保刷新后仍停留在"摘要管理"等当前页面
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
    const stored = await readSettingsLocal();
    return mergeStoredOptions(stored ?? {} as Partial<StoredOptions>);
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

// Watch form changes and auto-save
watch(
  () => [form.language, form.highlightColor, form.autoHighlightPageSummary, form.autoLocateFirstSummary],
  async () => {
    try {
      await writeSettingsLocal({
        language: form.language,
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
.ant-card {
  transition: all 0.3s ease;
}

.ant-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
}
</style>
