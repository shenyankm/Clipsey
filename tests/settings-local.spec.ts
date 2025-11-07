import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, readSettingsLocal, writeSettingsLocal, SETTINGS_LOCAL_KEY, watchSettingsLocal } from '@/utils/settings-local';

// 创建 chrome.storage.local 的简单模拟
function createChromeMock() {
  const store: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void> = [];

  return {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          const key = Object.keys(obj)[0];
          const oldValue = store[key];
          store[key] = obj[key];
          // 触发变更事件
          listeners.forEach(fn => fn({ [key]: { oldValue, newValue: store[key] } }, 'local'));
        })
      },
      onChanged: {
        addListener: vi.fn((fn: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void) => {
          listeners.push(fn);
        }),
        removeListener: vi.fn((fn: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void) => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        })
      }
    },
    runtime: {
      sendMessage: vi.fn()
    }
  };
}

describe('settings-local service', () => {
  beforeEach(() => {
    // 重置全局 chrome
    (globalThis as any).chrome = createChromeMock();
  });

  it('should read default settings when no data exists', async () => {
    const val = await readSettingsLocal();
    expect(val).toEqual(DEFAULT_SETTINGS);
  });

  it('should write and read settings successfully', async () => {
    await writeSettingsLocal({ language: 'en-US', highlightColor: 'blue' });
    const val = await readSettingsLocal();
    expect(val.language).toBe('en-US');
    expect(val.highlightColor).toBe('blue');
  });

  it('should watch settings changes', async () => {
    const calls: any[] = [];
    const off = watchSettingsLocal((newVal, oldVal) => {
      calls.push({ newVal, oldVal });
    });

    await writeSettingsLocal({ highlightColor: 'green' });
    expect(calls.length).toBe(1);
    expect(calls[0].newVal.highlightColor).toBe('green');
    expect(calls[0].oldVal.highlightColor).toBe('amber');

    off();
    await writeSettingsLocal({ highlightColor: 'amber' });
    expect(calls.length).toBe(1); // 无新增调用
  });

  it('should use unified key', async () => {
    await writeSettingsLocal({ language: 'zh-TW' });
    const items = await global.chrome.storage.local.get(SETTINGS_LOCAL_KEY);
    expect(items[SETTINGS_LOCAL_KEY].language).toBe('zh-TW');
  });
});