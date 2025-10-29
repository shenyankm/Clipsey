import { indexedDBManager } from './indexeddb';
import type { SettingsRecord } from '@/types/indexeddb';

export const SETTINGS_STORE_KEY = 'clipsey-options';

/**
 * Load the persisted settings value from IndexedDB.
 */
export async function readSettingsValue<T = Record<string, unknown>>(): Promise<T | null> {
  await indexedDBManager.init();
  const record = await indexedDBManager.get('settings', SETTINGS_STORE_KEY);
  return (record as SettingsRecord | undefined)?.value ?? null;
}

/**
 * Persist the provided settings value into IndexedDB.
 */
export async function writeSettingsValue<T = Record<string, unknown>>(value: T): Promise<void> {
  await indexedDBManager.init();
  const now = new Date().toISOString();
  const record: SettingsRecord = {
    key: SETTINGS_STORE_KEY,
    value,
    updatedAt: now
  };
  await indexedDBManager.put('settings', record);
}
