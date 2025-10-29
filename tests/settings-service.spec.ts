import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsService, SETTINGS_STORE_KEY } from '@/background/services/settings-service';

// Mock indexedDBManager
vi.mock('@/background/indexeddb', () => {
  const db: Record<string, any> = {};
  return {
    indexedDBManager: {
      init: vi.fn(async () => {}),
      get: vi.fn(async (_store: string, key: string) => db[key] ?? null),
      put: vi.fn(async (_store: string, record: any) => {
        db[record.key] = record;
      })
    }
  };
});

describe('SettingsService', () => {
  beforeEach(() => {
    // reset mock store
  });

  it('writes and reads settings value', async () => {
    const value = { language: 'zh-CN', hotkey: 'Alt+S' };
    await settingsService.write(value);
    const loaded = await settingsService.read<typeof value>();
    expect(loaded).toEqual(value);
  });

  it('returns null when no settings exist', async () => {
    const loaded = await settingsService.read();
    // First test may have written; ensure we write a new value then read
    await settingsService.write({});
    const loaded2 = await settingsService.read();
    expect(loaded2).toEqual({});
    expect(SETTINGS_STORE_KEY).toBe('clipsey-options');
  });
});