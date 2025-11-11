/** 数据迁移：将 browser.storage.local 的数据迁移到 IndexedDB。 */
import { browser } from 'wxt/browser';

import type { Clip } from '@/types/clip';
import type { ErrorLogRecord } from '@/types/indexeddb';
import { saveClips } from './storage';
import { indexedDBManager } from './indexeddb';

// 迁移剪辑数据（browser.storage.local -> IndexedDB）
export async function migrateClipsFromChromeStorage(): Promise<{
  success: boolean;
  migratedCount: number;
  error?: string;
}> {
  try {
    // 检查是否在 Chrome 扩展环境中
    if (!browser.storage?.local) {
      return { success: false, migratedCount: 0, error: 'Not in Chrome extension environment' };
    }

    // 尝试从 browser.storage.local 读取旧数据
    const result = await browser.storage.local.get('clips');
    const oldClips = result.clips;

    if (!Array.isArray(oldClips) || oldClips.length === 0) {
      console.log('[Migration] No clips data found in browser.storage.local');
      return { success: true, migratedCount: 0 };
    }

    // 迁移到 IndexedDB
    await saveClips(oldClips as Clip[]);

    // 迁移成功后，从 browser.storage.local 中移除旧数据
    await browser.storage.local.remove('clips');

    console.log(`[Migration] Successfully migrated ${oldClips.length} clips to IndexedDB`);
    return { success: true, migratedCount: oldClips.length };
  } catch (error) {
    console.error('[Migration] Failed to migrate clips:', error);
    return {
      success: false,
      migratedCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 迁移错误日志（browser.storage.local -> IndexedDB）
export async function migrateErrorLogsFromChromeStorage(): Promise<{
  success: boolean;
  migratedCount: number;
  error?: string;
}> {
  try {
    if (!browser.storage?.local) {
      return { success: false, migratedCount: 0, error: 'Not in Chrome extension environment' };
    }

    const result = await browser.storage.local.get('errorLogs');
    const oldLogs = result.errorLogs;

    if (!Array.isArray(oldLogs) || oldLogs.length === 0) {
      console.log('[Migration] No error logs found in browser.storage.local');
      return { success: true, migratedCount: 0 };
    }

    // 迁移到 IndexedDB
    await indexedDBManager.init();
    for (const log of oldLogs) {
      await indexedDBManager.add('errorLogs', log as ErrorLogRecord);
    }

    // 迁移成功后，从 browser.storage.local 中移除旧数据
    await browser.storage.local.remove('errorLogs');

    console.log(`[Migration] Successfully migrated ${oldLogs.length} error logs to IndexedDB`);
    return { success: true, migratedCount: oldLogs.length };
  } catch (error) {
    console.error('[Migration] Failed to migrate error logs:', error);
    return {
      success: false,
      migratedCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 执行完整迁移（剪辑与错误日志）
export async function migrateAllData(): Promise<{
  clipsResult: { success: boolean; migratedCount: number; error?: string };
  errorLogsResult: { success: boolean; migratedCount: number; error?: string };
}> {
  console.log('[Migration] Starting data migration from browser.storage.local to IndexedDB');

  const clipsResult = await migrateClipsFromChromeStorage();
  const errorLogsResult = await migrateErrorLogsFromChromeStorage();

  console.log('[Migration] Migration completed:', {
    clips: clipsResult,
    errorLogs: errorLogsResult
  });

  return { clipsResult, errorLogsResult };
}


