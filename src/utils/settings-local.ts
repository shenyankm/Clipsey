/** 设置本地存储：统一读/写/监听接口，提供默认值与错误回退（基于 chrome.storage.local）。 */

export type LanguageOption = 'zh-CN' | 'zh-TW' | 'en-US';
export type HighlightColorScheme = 'amber' | 'green' | 'blue';

export interface SettingsOptions {
  language: LanguageOption;
  highlightColor: HighlightColorScheme;
  autoHighlightPageSummary: boolean;
  autoLocateFirstSummary: boolean;
  schemaVersion: number;
}

export const SETTINGS_LOCAL_KEY = 'clipsey-options';

export const DEFAULT_SETTINGS: SettingsOptions = {
  language: 'zh-CN',
  highlightColor: 'amber',
  autoHighlightPageSummary: true,
  autoLocateFirstSummary: true,
  schemaVersion: 1
};

/** 读取设置：带默认值与错误回退。 */
export async function readSettingsLocal(): Promise<SettingsOptions> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get(SETTINGS_LOCAL_KEY);
      const raw = items[SETTINGS_LOCAL_KEY] as Partial<SettingsOptions> | undefined;
      return mergeWithDefaults(raw);
    }
  } catch (error) {
    console.warn('[SettingsLocal] Failed to read settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/** 写入设置：支持部分覆盖并自动合并默认值。 */
export async function writeSettingsLocal(partial: Partial<SettingsOptions>): Promise<void> {
  try {
    const current = await readSettingsLocal();
    const next = { ...current, ...partial } satisfies SettingsOptions;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [SETTINGS_LOCAL_KEY]: next });
    }
  } catch (error) {
    console.warn('[SettingsLocal] Failed to write settings:', error);
  }
}

/** 监听设置变化：仅监听 chrome.storage.local 区域。 */
export function watchSettingsLocal(
  listener: (newValue: SettingsOptions, oldValue?: SettingsOptions) => void
): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
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
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handler);
    }
  } catch {
    // ignore
  }

  // 返回取消监听的函数
  return () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handler);
      }
    } catch {
      // ignore
    }
  };
}

/** 合并默认值：保证设置结构完整。 */
function mergeWithDefaults(raw?: Partial<SettingsOptions>): SettingsOptions {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw) return base;
  return {
    language: (raw.language ?? base.language) as LanguageOption,
    highlightColor: (raw.highlightColor ?? base.highlightColor) as HighlightColorScheme,
    autoHighlightPageSummary: raw.autoHighlightPageSummary ?? base.autoHighlightPageSummary,
    autoLocateFirstSummary: raw.autoLocateFirstSummary ?? base.autoLocateFirstSummary,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : base.schemaVersion
  } satisfies SettingsOptions;
}