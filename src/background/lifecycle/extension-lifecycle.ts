import { indexedDBManager } from '../indexeddb';
import { migrateAllData } from '../migration';
import { migrateSettingsToLocal } from '../migration-settings';
import { contentScriptService } from '../services/content-script-service';
import { ErrorHandler } from '@/utils/error-handler';

/** 扩展生命周期管理器：处理扩展安装与启动事件 */
export class ExtensionLifecycle {
  /**
   * 处理扩展安装事件
   */
  async onInstalled(): Promise<void> {
    // 初始化IndexedDB
    try {
      await indexedDBManager.init();
      console.log('IndexedDB initialized successfully');
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'IndexedDB initialization');
      console.error(appError.userMessage);
    }

    // 执行数据迁移（从 chrome.storage.local 迁移到 IndexedDB）
    try {
      const migrationResult = await migrateAllData();
      if (migrationResult.clipsResult.migratedCount > 0 || migrationResult.errorLogsResult.migratedCount > 0) {
        console.log('[Migration] Data migration completed:', migrationResult);
      }
    } catch (error) {
      console.warn('[Migration] Data migration failed (non-critical):', error);
    }

    // 迁移基础设置到 chrome.storage.local（一次性）
    try {
      const settingsResult = await migrateSettingsToLocal();
      if (settingsResult.migrated) {
        console.log('[Migration] Settings migrated to chrome.storage.local');
      }
    } catch (error) {
      console.warn('[Migration] Settings migration failed (non-critical):', error);
    }

    // 注册内容脚本
    try {
      await contentScriptService.registerContentScript();
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Content script registration');
      console.error(appError.userMessage);
    }
  }

  /**
   * 处理扩展启动事件
   */
  async onStartup(): Promise<void> {
    console.debug('扩展启动');
    
    // 确保IndexedDB已初始化
    try {
      await indexedDBManager.init();
      console.log('IndexedDB initialized on startup');
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'IndexedDB startup initialization');
      console.error(appError.userMessage);
    }
    
    // 注册内容脚本
    try {
      await contentScriptService.registerContentScript();
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Content script registration on startup');
      console.error(appError.userMessage);
    }

    // 确保基础设置存在于 chrome.storage.local（如首次启动或本地数据被清理）
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

// 导出单例实例
export const extensionLifecycle = new ExtensionLifecycle();
