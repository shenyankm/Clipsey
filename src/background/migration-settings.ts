/** 设置迁移：将 IndexedDB(settings) 迁移到 chrome.storage.local，安装或启动阶段无感执行。 */
import { indexedDBManager } from '@/background/indexeddb';
import { settingsService } from '@/background/services/settings-service';
import { SETTINGS_LOCAL_KEY, DEFAULT_SETTINGS } from '@/utils/settings-local';

export async function migrateSettingsToLocal(): Promise<{ migrated: boolean; error?: string }> {
  try {
    // 如果不是扩展环境或不支持 storage，则跳过
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return { migrated: false, error: 'Not in Chrome extension environment' };
    }

    // 如果 local 已存在设置，则认为已迁移，跳过
    const localItems = await chrome.storage.local.get(SETTINGS_LOCAL_KEY);
    if (localItems && localItems[SETTINGS_LOCAL_KEY]) {
      return { migrated: false };
    }

    // 读取 IndexedDB 中旧设置
    const oldValue = await settingsService.read<Record<string, unknown>>();
    if (!oldValue) {
      // 不存在旧设置时，写入默认设置
      await chrome.storage.local.set({ [SETTINGS_LOCAL_KEY]: DEFAULT_SETTINGS });
      return { migrated: true };
    }

    // 写入到 local
    await chrome.storage.local.set({ [SETTINGS_LOCAL_KEY]: oldValue });

    // 清理旧 settings store 中的该记录（可选）
    try {
      await indexedDBManager.clear('settings');
    } catch {
      // 清理失败不影响迁移结果
    }

    return { migrated: true };
  } catch (error) {
    console.warn('[Migration] Settings migration failed:', error);
    return { migrated: false, error: error instanceof Error ? error.message : String(error) };
  }
}