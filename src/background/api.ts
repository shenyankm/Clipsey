import type { Clip } from '@/types/clip';
import { stripTextFragment } from '@/utils/clip/text-fragment';
import { highlightSyncService } from './services/highlight-sync-service';
import { searchService, type SearchQuery, type SearchResult, type SearchType, type SortBy } from './services/search-service';
import { exportService } from './services/export-service';
import type { ErrorLogRecord } from '@/types/indexeddb';
import { IndexedDBQuery } from './indexeddb-query';

// 重新导出类型
export type { SearchQuery, SearchResult, SearchType, SortBy };

// 获取所有 Clips（走 storage 层缓存）
export async function getClips(): Promise<Clip[]> {
  const { getClips: getClipsFromStorage } = await import('./storage');
  return getClipsFromStorage();
}

// 删除指定 ID 的 Clip；若该 Clip 有高亮则刷新对应页面高亮
export async function deleteClipById(id: string): Promise<void> {
  const { deleteClip } = await import('./storage');
  const deletedClip = await deleteClip(id);
  
  // 如果删除的是有高亮的 Clip，通知对应页面移除高亮
  if (deletedClip?.highlightId && deletedClip?.sourceUrl) {
    await highlightSyncService.removePageHighlight(deletedClip.sourceUrl, deletedClip.highlightId);
  }
}

// 刷新缓存（从 IndexedDB 重新加载）
export async function refreshClipsCache(): Promise<void> {
  const { refreshCache } = await import('./storage');
  await refreshCache();
}

// 搜索 Clips
export async function searchClips(query: SearchQuery): Promise<SearchResult> {
  return searchService.search(query);
}

export async function getClipsByUrlPaged(params: {
  url: string;
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ items: Clip[]; total: number; page: number; pageSize: number }> {
  const { url, page, pageSize, sortOrder = 'desc' } = params;
  const { data, total } = await IndexedDBQuery.paginate('clips', page, pageSize, {
    indexName: 'sourceUrl',
    query: IDBKeyRange.only(stripTextFragment(url)),
    direction: sortOrder === 'asc' ? 'next' : 'prev'
  });
  return { items: data as Clip[], total, page, pageSize };
}

// 获取错误日志列表
export async function getErrorLogs(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<ErrorLogRecord[]> {
  return exportService.getErrorLogs(options);
}

// 清空错误日志
export async function clearErrorLogs(): Promise<void> {
  return exportService.clearErrorLogs();
}

// 导出所有数据（备份）
export async function exportAllData(): Promise<{
  clips: Clip[];
  errorLogs: ErrorLogRecord[];
  exportedAt: string;
  version: string;
}> {
  return exportService.exportAll();
}

// 导入数据（恢复备份）
export async function importAllData(data: {
  clips?: Clip[];
  errorLogs?: ErrorLogRecord[];
}): Promise<{
  clipsImported: number;
  errorLogsImported: number;
}> {
  return exportService.importAll(data);
}
