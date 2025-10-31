<template>
  <n-config-provider :theme="themeObject" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <div class="options">
        <n-grid :cols="6" :x-gap="24">
          <n-gi :span="24">
            <n-card :bordered="false" size="small" :style="{ boxShadow: 'none' }" :content-style="{ padding: '0' }">
              <n-tabs v-model:value="activeItem" type="line" animated class="settings-tabs">
                <n-tab-pane name="basic" :tab="t('menuBasic')">
                  <div class="basic-settings-grid">
                    <!-- 显示语言：50% 宽度卡片，标签与选择框同一行 -->
                    <n-card size="small" class="basic-card">
                      <n-form :model="form" label-placement="left" class="basic-form">
                        <n-form-item
                          :label="t('displayLanguage')"
                          :label-style="{ width: '96px' }"
                          class="inline-form-item"
                        >
                          <n-select
                            v-model:value="form.language"
                            :options="languageOptions"
                            class="inline-select"
                          />
                        </n-form-item>
                      </n-form>
                    </n-card>

                    <!-- 内容高亮：50% 宽度卡片，标签与颜色选择器同一行 -->
                    <n-card size="small" class="basic-card">
                      <n-form :model="form" label-placement="left" class="basic-form">
                        <n-form-item
                          :label="t('highlightColor')"
                          :label-style="{ width: '96px' }"
                          class="inline-form-item"
                        >
                          <n-color-picker
                            v-model:value="form.highlightColor"
                            :show-alpha="false"
                            class="inline-color-picker"
                          />
                        </n-form-item>

                        <n-form-item :label="t('autoHighlightPageSummary')" :label-style="{ width: '96px' }">
                          <n-switch v-model:value="form.autoHighlightPageSummary" />
                        </n-form-item>
                        <n-form-item :label="t('autoLocateFirstSummary')" :label-style="{ width: '96px' }">
                          <n-switch v-model:value="form.autoLocateFirstSummary" />
                        </n-form-item>
                      </n-form>
                    </n-card>
                  </div>
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
import { onMounted, onBeforeUnmount, reactive, ref, computed, watch } from 'vue';
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

/* 基础设置并排布局（50% 宽度） */
.basic-settings-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.basic-card {
  flex: 1 1 calc(50% - 12px);
  min-width: 280px; /* 保证控件可操作性 */
}

.basic-form {
  width: 100%;
}

.inline-form-item {
  display: flex;
  align-items: center;
}

.inline-select {
  width: 200px;
}

.inline-color-picker {
  width: 200px;
}

@media (max-width: 768px) {
  .options {
    padding: 16px;
  }

  .basic-card {
    flex: 1 1 100%;
  }
}
</style>
