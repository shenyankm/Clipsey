import type { Clip } from '@/types/clip';
import type { ErrorLogRecord } from '@/types/indexeddb';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';

/** 导入导出服务：负责数据备份与恢复。 */
export class ExportService {
  /** 导出所有数据（用于备份）。 */
  async exportAll(): Promise<{
    clips: Clip[];
    errorLogs: ErrorLogRecord[];
    exportedAt: string;
    version: string;
  }> {
    await indexedDBManager.init();
    
    const { getClips } = await import('@/background/storage');
    const clips = await getClips();
    const errorLogs = await this.getErrorLogs({ limit: 1000 });
    
    return {
      clips,
      errorLogs,
      exportedAt: new Date().toISOString(),
      version: '2.0' // IndexedDB 版本
    };
  }

  /** 导入数据（用于恢复备份）。 */
  async importAll(data: {
    clips?: Clip[];
    errorLogs?: ErrorLogRecord[];
  }): Promise<{
    clipsImported: number;
    errorLogsImported: number;
  }> {
    await indexedDBManager.init();
    
    let clipsImported = 0;
    let errorLogsImported = 0;
    
    // 导入 clips
    if (Array.isArray(data.clips) && data.clips.length > 0) {
      const { saveClips } = await import('@/background/storage');
      await saveClips(data.clips);
      clipsImported = data.clips.length;
    }
    
    // 导入错误日志
    if (Array.isArray(data.errorLogs) && data.errorLogs.length > 0) {
      for (const log of data.errorLogs) {
        try {
          await indexedDBManager.add('errorLogs', log);
          errorLogsImported++;
        } catch (error) {
          console.warn('[Import] Failed to import error log:', error);
        }
      }
    }
    
    return { clipsImported, errorLogsImported };
  }

  /** 获取错误日志列表。 */
  async getErrorLogs(options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<ErrorLogRecord[]> {
    await indexedDBManager.init();
    
    return IndexedDBQuery.getAll('errorLogs', {
      indexName: 'time',
      direction: 'desc',
      limit: options.limit,
      offset: options.offset
    });
  }

  /** 清空错误日志。 */
  async clearErrorLogs(): Promise<void> {
    await indexedDBManager.init();
    await indexedDBManager.clear('errorLogs');
  }
}

// 导出单例实例
export const exportService = new ExportService();
