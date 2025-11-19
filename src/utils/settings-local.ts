/** 管理本地存储的统一读/写/监听接口，提供默认值并包裹 browser.storage.local */
import { browser as wxtBrowser } from 'wxt/browser';

export type LanguageOption = 'zh-CN' | 'en-US';
export type HighlightColorScheme = 'amber' | 'green' | 'blue';
export type AiProvider = 'qwen' | 'deepseek';

type HighlightColorConfig = {
  label: string;
  hex: string;
};

export const HIGHLIGHT_COLOR_SCHEMES: Record<HighlightColorScheme, HighlightColorConfig> = {
  amber: { label: 'highlightColorAmber', hex: '#FFC107' },
  green: { label: 'highlightColorGreen', hex: '#81C784' },
  blue: { label: 'highlightColorBlue', hex: '#64B5F6' }
} as const;

export interface SettingsOptions {
  language: LanguageOption;
  highlightColor: HighlightColorScheme;
  autoHighlightPageSummary: boolean;
  autoLocateFirstSummary: boolean;
  aiSummaryEnabled: boolean;
  aiProvider: AiProvider;
  aiSummaryApiKey: string;
  schemaVersion: number;
}

export const SETTINGS_LOCAL_KEY = 'clipsey-options';

export const DEFAULT_SETTINGS: SettingsOptions = {
  language: 'zh-CN',
  highlightColor: 'amber',
  autoHighlightPageSummary: true,
  autoLocateFirstSummary: true,
  aiSummaryEnabled: false,
  aiProvider: 'qwen',
  aiSummaryApiKey: '',
  schemaVersion: 1
};

export const HIGHLIGHT_COLOR_OPTIONS = Object.entries(HIGHLIGHT_COLOR_SCHEMES).map(
  ([value, config]) => ({
    label: config.label,
    value: value as HighlightColorScheme,
    hex: config.hex
  })
);

function getBrowser(): any {
  const globalBrowser = (globalThis as any).browser;
  if (globalBrowser) return globalBrowser;
  return (typeof wxtBrowser !== 'undefined' && wxtBrowser) ? wxtBrowser : undefined;
}

/** 读取设置，始终返回带默认值的结构 */
export async function readSettingsLocal(): Promise<SettingsOptions> {
  try {
    const b = getBrowser();
    if (b?.storage?.local) {
      const items = await b.storage.local.get(SETTINGS_LOCAL_KEY);
      const raw = items[SETTINGS_LOCAL_KEY] as Partial<SettingsOptions> | undefined;
      return mergeWithDefaults(raw);
    }
  } catch (error) {
    console.warn('[SettingsLocal] Failed to read settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/** 写入设置，支持传入部分字段自动与默认值合并 */
export async function writeSettingsLocal(partial: Partial<SettingsOptions>): Promise<void> {
  try {
    const current = await readSettingsLocal();
    const next = { ...current, ...partial } satisfies SettingsOptions;
    const b = getBrowser();
    if (b?.storage?.local) {
      await b.storage.local.set({ [SETTINGS_LOCAL_KEY]: next });
    }
  } catch (error) {
    console.warn('[SettingsLocal] Failed to write settings:', error);
  }
}

/** 监听设置变更，回调总能拿到完整的 SettingsOptions */
export function watchSettingsLocal(
  listener: (newValue: SettingsOptions, oldValue?: SettingsOptions) => void
): () => void {
  type StorageChangeListener = Parameters<typeof wxtBrowser.storage.onChanged.addListener>[0];
  type StorageChanges = StorageChangeListener extends (...args: infer Args) => any ? Args[0] : never;
  type StorageArea = StorageChangeListener extends (...args: infer Args) => any ? Args[1] : never;

  const handler: StorageChangeListener = (changes: StorageChanges, areaName: StorageArea) => {
    if (areaName !== 'local') return;
    const change = changes[SETTINGS_LOCAL_KEY];
    if (!change) return;
    const newVal = mergeWithDefaults(change.newValue as Partial<SettingsOptions> | undefined);
    const oldVal = mergeWithDefaults(change.oldValue as Partial<SettingsOptions> | undefined);
    try {
      listener(newVal, oldVal);
    } catch (error) {
      console.warn('[SettingsLocal] Watch listener error:', error);
    }
  };

  try {
    const b = getBrowser();
    if (b?.storage?.onChanged) {
      b.storage.onChanged.addListener(handler);
    }
  } catch {
    // ignore
  }

  // 返回移除监听的函数
  return () => {
    try {
      const b = getBrowser();
      if (b?.storage?.onChanged) {
        b.storage.onChanged.removeListener(handler);
      }
    } catch {
      // ignore
    }
  };
}

/** 合并默认值，确保结构完整 */
function mergeWithDefaults(raw?: Partial<SettingsOptions>): SettingsOptions {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw) return base;
  return {
    language: (raw.language ?? base.language) as LanguageOption,
    highlightColor: (raw.highlightColor ?? base.highlightColor) as HighlightColorScheme,
    autoHighlightPageSummary: raw.autoHighlightPageSummary ?? base.autoHighlightPageSummary,
    autoLocateFirstSummary: raw.autoLocateFirstSummary ?? base.autoLocateFirstSummary,
    aiSummaryEnabled: raw.aiSummaryEnabled ?? base.aiSummaryEnabled,
    aiProvider: (raw.aiProvider ?? base.aiProvider) as AiProvider,
    aiSummaryApiKey: raw.aiSummaryApiKey ?? base.aiSummaryApiKey,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : base.schemaVersion
  } satisfies SettingsOptions;
}
