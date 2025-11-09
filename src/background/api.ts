import type { Clip } from '@/types/clip';
import { highlightSyncService } from './services/highlight-sync-service';
import { searchService, type SearchQuery, type SearchResult, type SearchType, type SortBy } from './services/search-service';
import { exportService } from './services/export-service';
import type { ErrorLogRecord } from '@/types/indexeddb';

export interface SyncResponse {
  success: boolean;
  syncedAt: string;
}

// 重新导出类型
export type { SearchQuery, SearchResult, SearchType, SortBy };

/**
 * 远程同步的占位实现，实际使用时请替换为真实的后端请求逻辑。
 */
export async function syncClips(_clips: Clip[]): Promise<SyncResponse> {
  return {
    success: true,
    syncedAt: new Date().toISOString()
  };
}

/**
 * 获取所有Clips - 统一使用storage层的缓存机制
 */
export async function getClips(): Promise<Clip[]> {
  const { getClips: getClipsFromStorage } = await import('./storage');
  return getClipsFromStorage();
}

/**
 * 删除指定ID的Clip
 * 删除后主动刷新所有打开页面的高亮状态
 */
export async function deleteClipById(id: string): Promise<void> {
  const { getClips, saveClips } = await import('./storage');
  const clips = await getClips();
  const deletedClip = clips.find(clip => clip.id === id);
  const updated = clips.filter(clip => clip.id !== id);
  
  await saveClips(updated);
  
  // 如果删除的是有高亮的 Clip，通知对应页面移除高亮
  if (deletedClip?.highlightId && deletedClip?.sourceUrl) {
    void highlightSyncService.refreshPageHighlights(deletedClip.sourceUrl);
  }
}

/**
 * 刷新缓存 - 从 IndexedDB 重新加载数据
 */
export async function refreshClipsCache(): Promise<void> {
  const { refreshCache } = await import('./storage');
  await refreshCache();
}

/**
 * 搜索Clips
 */
export async function searchClips(query: SearchQuery): Promise<SearchResult> {
  return searchService.search(query);
}

/**
 * 获取错误日志列表
 */
export async function getErrorLogs(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<ErrorLogRecord[]> {
  return exportService.getErrorLogs(options);
}

/**
 * 清空错误日志
 */
export async function clearErrorLogs(): Promise<void> {
  return exportService.clearErrorLogs();
}

/**
 * 导出所有数据（用于备份）
 */
export async function exportAllData(): Promise<{
  clips: Clip[];
  errorLogs: ErrorLogRecord[];
  exportedAt: string;
  version: string;
}> {
  return exportService.exportAll();
}

/**
 * 导入数据（用于恢复备份）
 */
export async function importAllData(data: {
  clips?: Clip[];
  errorLogs?: ErrorLogRecord[];
}): Promise<{
  clipsImported: number;
  errorLogsImported: number;
}> {
  return exportService.importAll(data);
}
