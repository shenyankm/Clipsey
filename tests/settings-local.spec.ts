import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, readSettingsLocal, writeSettingsLocal, SETTINGS_LOCAL_KEY, watchSettingsLocal } from '@/utils/settings-local';

// 创建 browser.storage.local 的简单模拟
function createBrowserMock() {
  const store: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void> = [];

  return {
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[]) => {
          // 模拟 browser.storage.local.get 的行为
          if (key === undefined) {
            return store;
          }
          if (typeof key === 'string') {
            // 如果没有存储的值，返回 undefined（这是正常的）
            return { [key]: store[key] };
          }
          if (Array.isArray(key)) {
            const result: Record<string, unknown> = {};
            key.forEach(k => {
              result[k] = store[k];
            });
            return result;
          }
          return {};
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          // 模拟 browser.storage.local.set 的行为
          Object.keys(obj).forEach(key => {
            const oldValue = store[key];
            store[key] = obj[key];
            // 触发变更事件
            listeners.forEach(fn => fn({ [key]: { oldValue, newValue: store[key] } }, 'local'));
          });
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
    // 重置全局 browser
    (globalThis as any).browser = createBrowserMock();
  });

  it('should read default settings when no data exists', async () => {
    const val = await readSettingsLocal();
    expect(val).toEqual(DEFAULT_SETTINGS);
  });

  it('should write and read settings successfully', async () => {
    // 调试：检查初始状态
    const initialItems = await (globalThis as any).browser.storage.local.get(SETTINGS_LOCAL_KEY);
    console.log('Initial items:', initialItems);
    
    await writeSettingsLocal({ highlightColor: 'blue' });
    
    // 调试：检查写入后状态
    const storedItems = await (globalThis as any).browser.storage.local.get(SETTINGS_LOCAL_KEY);
    console.log('Stored items after write:', storedItems);
    
    const val = await readSettingsLocal();
    console.log('Read value:', val);
    
    expect(val.language).toBe('zh-CN'); // 语言现在固定为 zh-CN
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
    await writeSettingsLocal({ highlightColor: 'green' });
    const items = await (globalThis as any).browser.storage.local.get(SETTINGS_LOCAL_KEY);
    expect(items[SETTINGS_LOCAL_KEY].highlightColor).toBe('green');
  });
});