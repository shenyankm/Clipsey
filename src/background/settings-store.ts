import { settingsService } from '@/background/services/settings-service';
export { SETTINGS_STORE_KEY } from '@/background/services/settings-service';

/**
 * Load the persisted settings value from IndexedDB.
 * 保持对旧 API 的向后兼容。
 */
export async function readSettingsValue<T = Record<string, unknown>>(): Promise<T | null> {
  return settingsService.read<T>();
}

/**
 * Persist the provided settings value into IndexedDB.
 * 保持对旧 API 的向后兼容。
 */
export async function writeSettingsValue<T = Record<string, unknown>>(value: T): Promise<void> {
  return settingsService.write<T>(value);
}
