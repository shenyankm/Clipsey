import { indexedDBManager } from '../indexeddb';
import { migrateAllData } from '../migration';
import { migrateSettingsToLocal } from '../migration-settings';
import { ErrorHandler } from '@/utils/error-handler';

/** 扩展生命周期：负责安装与启动阶段的初始化/迁移。 */
export class ExtensionLifecycle {
  /** 处理扩展的安装事件 */
  async onInstalled(): Promise<void> {
    try {
      await indexedDBManager.init();
      console.log('IndexedDB initialized successfully');
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'IndexedDB initialization');
      console.error(appError.userMessage);
    }

    try {
      const migrationResult = await migrateAllData();
      if (migrationResult.clipsResult.migratedCount > 0 || migrationResult.errorLogsResult.migratedCount > 0) {
        console.log('[Migration] Data migration completed:', migrationResult);
      }
    } catch (error) {
      console.warn('[Migration] Data migration failed (non-critical):', error);
    }

    try {
      const settingsResult = await migrateSettingsToLocal();
      if (settingsResult.migrated) {
        console.log('[Migration] Settings migrated to chrome.storage.local');
      }
    } catch (error) {
      console.warn('[Migration] Settings migration failed (non-critical):', error);
    }
  }

  /** 处理扩展的启动事件 */
  async onStartup(): Promise<void> {
    console.debug('Extension startup');

    try {
      await indexedDBManager.init();
      console.log('IndexedDB initialized on startup');
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'IndexedDB startup initialization');
      console.error(appError.userMessage);
    }

    try {
      const result = await migrateSettingsToLocal();
      if (result.migrated) {
        console.log('[Migration] Settings ensured in chrome.storage.local');
      }
    } catch (error) {
      console.warn('[Migration] Ensure settings in local failed (non-critical):', error);
    }
  }
}

export const extensionLifecycle = new ExtensionLifecycle();
