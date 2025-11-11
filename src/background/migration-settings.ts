/** 设置迁移：将 IndexedDB(settings) 迁移到 storage.local，安装/启动阶段无感执行。 */
import { browser } from 'wxt/browser';
import { indexedDBManager } from '@/background/indexeddb';
import { settingsService } from '@/background/services/settings-service';
import { SETTINGS_LOCAL_KEY, DEFAULT_SETTINGS } from '@/utils/settings-local';

export async function migrateSettingsToLocal(): Promise<{ migrated: boolean; error?: string }> {
  try {
    if (!browser.storage?.local) {
      return { migrated: false, error: 'Storage API unavailable' };
    }

    const localItems = await browser.storage.local.get(SETTINGS_LOCAL_KEY);
    if (localItems && localItems[SETTINGS_LOCAL_KEY]) {
      return { migrated: false };
    }

    const oldValue = await settingsService.read<Record<string, unknown>>();
    if (!oldValue) {
      await browser.storage.local.set({ [SETTINGS_LOCAL_KEY]: DEFAULT_SETTINGS });
      return { migrated: true };
    }

    await browser.storage.local.set({ [SETTINGS_LOCAL_KEY]: oldValue });

    try {
      await indexedDBManager.clear('settings');
    } catch {
      // ignore cleanup failure
    }

    return { migrated: true };
  } catch (error) {
    console.warn('[Migration] Settings migration failed:', error);
    return { migrated: false, error: error instanceof Error ? error.message : String(error) };
  }
}
