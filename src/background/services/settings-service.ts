import { indexedDBManager } from '@/background/indexeddb';
import type { SettingsRecord } from '@/types/indexeddb';

export const SETTINGS_STORE_KEY = 'clipsey-options';

export class SettingsService {
  async read<T = Record<string, unknown>>(): Promise<T | null> {
    await indexedDBManager.init();
    const record = await indexedDBManager.get('settings', SETTINGS_STORE_KEY);
    return (record as SettingsRecord | undefined)?.value ?? null;
  }

  async write<T = Record<string, unknown>>(value: T): Promise<void> {
    await indexedDBManager.init();
    const now = new Date().toISOString();
    const record: SettingsRecord = {
      key: SETTINGS_STORE_KEY,
      value,
      updatedAt: now
    };
    await indexedDBManager.put('settings', record);
  }
}

export const settingsService = new SettingsService();