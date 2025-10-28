import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import {
  IndexedDBError,
  type MigrationStatus,
  type SettingsRecord,
  type MetadataRecord,
  type MigrationRecord
} from '@/types/indexeddb';
import type { Clip } from '@/types/clip';

/**
 * 数据迁移管理器
 */
export class MigrationManager {
  private static readonly MIGRATION_KEY = 'clipsey_migration_status';
  private static readonly BACKUP_KEY = 'clipsey_chrome_storage_backup';

  /**
   * 检查迁移状态
   */
  static async getMigrationStatus(): Promise<MigrationStatus> {
    try {
      const status = await indexedDBManager.get('metadata', this.MIGRATION_KEY);
      return status?.value as MigrationStatus || 'not_started';
    } catch (error) {
      console.warn('Failed to get migration status:', error);
      return 'not_started';
    }
  }

  /**
   * 设置迁移状态
   */
  static async setMigrationStatus(status: MigrationStatus): Promise<void> {
    const now = new Date().toISOString();
    const record: MetadataRecord = {
      key: this.MIGRATION_KEY,
      value: status,
      createdAt: now,
      updatedAt: now
    };

    await indexedDBManager.put('metadata', record);
  }

  /**
   * 执行完整迁移
   */
  static async migrate(): Promise<void> {
    const currentStatus = await this.getMigrationStatus();
    
    if (currentStatus === 'completed') {
      console.log('Migration already completed');
      return;
    }

    if (currentStatus === 'in_progress') {
      console.log('Migration already in progress');
      return;
    }

    try {
      await this.setMigrationStatus('in_progress');
      console.log('Starting migration from Chrome Storage to IndexedDB...');

      // 1. 备份现有数据
      await this.backupChromeStorage();

      // 2. 迁移 clips 数据
      await this.migrateClips();

      // 3. 迁移设置数据
      await this.migrateSettings();

      // 4. 验证迁移结果
      await this.validateMigration();

      await this.setMigrationStatus('completed');
      console.log('Migration completed successfully');

    } catch (error) {
      await this.setMigrationStatus('failed');
      console.error('Migration failed:', error);
      throw new IndexedDBError(
        'Migration failed',
        'MIGRATION_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 备份 Chrome Storage 数据
   */
  private static async backupChromeStorage(): Promise<void> {
    console.log('Backing up Chrome Storage data...');

    try {
      // 备份 local storage
      const localData = await this.getChromeStorageLocal();
      
      // 备份 sync storage (如果可用)
      let syncData = {};
      try {
        syncData = await this.getChromeStorageSync();
      } catch (error) {
        console.warn('Chrome Storage Sync not available:', error);
      }

      const backup = {
        local: localData,
        sync: syncData,
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version
      };

      // 保存备份到 IndexedDB
      const backupRecord: MetadataRecord = {
        key: this.BACKUP_KEY,
        value: backup,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await indexedDBManager.put('metadata', backupRecord);
      console.log('Chrome Storage backup completed');

    } catch (error) {
      throw new Error(`Failed to backup Chrome Storage: ${error}`);
    }
  }

  /**
   * 迁移 clips 数据
   */
  private static async migrateClips(): Promise<void> {
    console.log('Migrating clips data...');

    try {
      const localData = await this.getChromeStorageLocal();
      const clips: Clip[] = localData.clips || [];

      if (clips.length === 0) {
        console.log('No clips to migrate');
        return;
      }

      // 清空现有的 clips 数据
      await indexedDBManager.clear('clips');

      // 批量插入 clips
      const migratedClips = clips.map(clip => ({
        ...clip,
        createdAt: typeof clip.createdAt === 'string' ? clip.createdAt : new Date(clip.createdAt || Date.now()).toISOString(),
        updatedAt: new Date().toISOString()
      }));

      await IndexedDBQuery.bulkAdd('clips', migratedClips, {
        batchSize: 50
      });

      console.log(`Migrated ${clips.length} clips`);

    } catch (error) {
      throw new Error(`Failed to migrate clips: ${error}`);
    }
  }

  /**
   * 迁移设置数据
   */
  private static async migrateSettings(): Promise<void> {
    console.log('Migrating settings data...');

    try {
      // 从 Chrome Storage Sync 获取设置
      let syncData = {};
      try {
        syncData = await this.getChromeStorageSync();
      } catch (error) {
        console.warn('Chrome Storage Sync not available, checking localStorage');
        syncData = this.getLocalStorageSettings();
      }

      const settings = this.extractSettings(syncData);
      
      if (Object.keys(settings).length === 0) {
        console.log('No settings to migrate');
        return;
      }

      // 清空现有设置
      await indexedDBManager.clear('settings');

      // 迁移每个设置项
      const now = new Date().toISOString();
      const settingsRecords: SettingsRecord[] = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updatedAt: now
      }));

      await IndexedDBQuery.bulkAdd('settings', settingsRecords, {
        batchSize: 20
      });

      console.log(`Migrated ${settingsRecords.length} settings`);

    } catch (error) {
      throw new Error(`Failed to migrate settings: ${error}`);
    }
  }

  /**
   * 验证迁移结果
   */
  private static async validateMigration(): Promise<void> {
    console.log('Validating migration...');

    try {
      // 验证 clips 数据
      const originalClips = await this.getChromeStorageLocal().then(data => data.clips || []);
      const migratedClipsCount = await indexedDBManager.count('clips');
      
      if (originalClips.length !== migratedClipsCount) {
        throw new Error(`Clips count mismatch: original ${originalClips.length}, migrated ${migratedClipsCount}`);
      }

      // 验证设置数据
      const settingsCount = await indexedDBManager.count('settings');
      console.log(`Validation passed: ${migratedClipsCount} clips, ${settingsCount} settings`);

    } catch (error) {
      throw new Error(`Migration validation failed: ${error}`);
    }
  }

  /**
   * 回滚迁移
   */
  static async rollback(): Promise<void> {
    console.log('Rolling back migration...');

    try {
      // 获取备份数据
      const backupRecord = await indexedDBManager.get('metadata', this.BACKUP_KEY);
      if (!backupRecord) {
        throw new Error('No backup data found');
      }

      const backup = backupRecord.value as any;

      // 恢复 Chrome Storage Local
      if (backup.local && Object.keys(backup.local).length > 0) {
        await this.setChromeStorageLocal(backup.local);
      }

      // 恢复 Chrome Storage Sync
      if (backup.sync && Object.keys(backup.sync).length > 0) {
        try {
          await this.setChromeStorageSync(backup.sync);
        } catch (error) {
          console.warn('Failed to restore Chrome Storage Sync:', error);
        }
      }

      // 清空 IndexedDB 数据
      await indexedDBManager.clear('clips');
      await indexedDBManager.clear('settings');

      // 重置迁移状态
      await this.setMigrationStatus('not_started');

      console.log('Rollback completed successfully');

    } catch (error) {
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * 清理迁移数据
   */
  static async cleanup(): Promise<void> {
    console.log('Cleaning up migration data...');

    try {
      // 删除备份数据
      await indexedDBManager.delete('metadata', this.BACKUP_KEY);
      
      // 可选：清理 Chrome Storage 中的旧数据
      // await this.clearChromeStorage();

      console.log('Migration cleanup completed');

    } catch (error) {
      console.warn('Failed to cleanup migration data:', error);
    }
  }

  /**
   * Chrome Storage 操作辅助方法
   */
  private static getChromeStorageLocal(): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  private static getChromeStorageSync(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!chrome.storage.sync) {
        reject(new Error('Chrome Storage Sync not available'));
        return;
      }

      chrome.storage.sync.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  private static setChromeStorageLocal(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  private static setChromeStorageSync(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!chrome.storage.sync) {
        reject(new Error('Chrome Storage Sync not available'));
        return;
      }

      chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 从 localStorage 获取设置
   */
  private static getLocalStorageSettings(): any {
    const settings: any = {};
    const keys = ['enableSync', 'endpoint', 'hotkey', 'language', 'theme'];
    
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          settings[key] = JSON.parse(value);
        } catch {
          settings[key] = value;
        }
      }
    });

    return settings;
  }

  /**
   * 提取设置数据
   */
  private static extractSettings(data: any): Record<string, any> {
    const settingsKeys = ['enableSync', 'endpoint', 'hotkey', 'language', 'theme'];
    const settings: Record<string, any> = {};

    settingsKeys.forEach(key => {
      if (data[key] !== undefined) {
        settings[key] = data[key];
      }
    });

    return settings;
  }
}