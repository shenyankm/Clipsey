import type { Clip } from '@/types/clip';
import type { ErrorLogRecord } from '@/types/indexeddb';
import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { getClips as getClipsFromStorage } from './storage';

export interface SyncResponse {
  success: boolean;
  syncedAt: string;
}

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
 * 确保与REQUEST_CLIPS消息处理器返回的数据一致
 */
export async function getClips(): Promise<Clip[]> {
  // 使用storage.ts的统一接口，确保缓存一致性
  return getClipsFromStorage();
}

/**
 * 删除指定ID的Clip - 通过storage层统一处理，避免竞态条件
 * 优化：删除后主动刷新所有打开页面的高亮状态
 */
export async function deleteClipById(id: string): Promise<void> {
  // 直接使用 storage 层接口，确保缓存和 IndexedDB 同步更新
  const clips = await getClipsFromStorage();
  const deletedClip = clips.find(clip => clip.id === id);
  const updated = clips.filter(clip => clip.id !== id);
  
  // saveClips 会同时更新 IndexedDB 和缓存，并触发变更通知
  const { saveClips } = await import('./storage');
  await saveClips(updated);
  
  // 如果删除的是有高亮的 Clip，通知对应页面移除高亮
  if (deletedClip?.highlightId && deletedClip?.sourceUrl) {
    void refreshPageHighlights(deletedClip.sourceUrl);
  }
}

/**
 * 刷新指定URL页面的高亮显示
 * 用于删除Clip后同步更新页面高亮状态
 */
async function refreshPageHighlights(url: string): Promise<void> {
  try {
    // 获取所有标签页
    const tabs = await chrome.tabs.query({});
    
    // 找到匹配URL的标签页
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      
      // 比较URL（忽略查询参数和hash）
      try {
        const tabUrl = new URL(tab.url);
        const targetUrl = new URL(url);
        
        if (tabUrl.origin === targetUrl.origin && tabUrl.pathname === targetUrl.pathname) {
          // 获取该页面最新的 Clips
          const { getClipsForUrl } = await import('./storage');
          const clips = await getClipsForUrl(tab.url);
          
          // 构建高亮数据
          const highlights = clips
            .filter(clip => clip.highlightId && clip.textContent)
            .map(clip => ({
              id: clip.highlightId ?? clip.id,
              highlightId: clip.highlightId,
              textContent: clip.textContent,
              contextBefore: clip.contextBefore,
              contextAfter: clip.contextAfter,
              anchorSelector: clip.anchorSelector,
              textOffset: clip.textOffset,
              highlightStyle: clip.highlightStyle
            }));
          
          // 发送消息更新高亮
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'ACTIVATE_HIGHLIGHTS',
              payload: { highlights }
            });
          } catch (error) {
            // Content script 可能未加载，忽略错误
            console.debug(`[Highlight Refresh] Failed to update tab ${tab.id}:`, error);
          }
        }
      } catch (error) {
        // URL 解析失败，跳过
        continue;
      }
    }
  } catch (error) {
    console.warn('[Highlight Refresh] Failed to refresh page highlights:', error);
  }
}

/**
 * 刷新缓存 - 从 IndexedDB 重新加载数据
 * 用于确保 ClipManager 和 Popup 之间的数据一致性
 */
export async function refreshClipsCache(): Promise<void> {
  const { refreshCache } = await import('./storage');
  await refreshCache();
}

export type SearchType = 'all' | 'title' | 'website' | 'content';
export type SortBy = 'createdAt' | 'sourceUrl' | 'textContent' | 'title';

export interface SearchQuery {
  type?: SearchType;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SortBy;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

function normalizeSort(query: SearchQuery): { indexName?: string; direction: 'next' | 'prev' } {
  const sortBy = query.sortBy ?? 'createdAt';
  const sortOrder = query.sortOrder ?? 'desc';
  // 仅在存在索引时使用索引排序；title 无索引，回退为 createdAt
  const indexMap: Record<Exclude<SortBy, 'title'>, string> = {
    createdAt: 'createdAt',
    sourceUrl: 'sourceUrl',
    textContent: 'textContent'
  };
  const indexName = sortBy === 'title' ? 'createdAt' : indexMap[sortBy as Exclude<SortBy, 'title'>];
  const direction = sortOrder === 'asc' ? 'next' : 'prev';
  return { indexName, direction };
}

/**
 * 提供分页搜索能力：
 * - 无关键词：直接按索引分页获取（更高性能）
 * - 有关键词：游标过滤匹配字段，跳过 offset，仅收集 pageSize 条，统计总匹配数（避免一次性加载全部记录）。
 */
export async function searchClips(query: SearchQuery): Promise<SearchResult> {
  const page = Math.max(1, (query.page ?? 1) | 0);
  const pageSize = Math.max(1, Math.min(100, (query.pageSize ?? 20) | 0));
  const keyword = (query.keyword ?? '').trim();
  const type: SearchType = (query.type ?? 'all');

  const { indexName, direction } = normalizeSort(query);

  // 无关键词：直接分页
  if (!keyword) {
    const { data, total } = await IndexedDBQuery.paginate('clips', page, pageSize, {
      indexName,
      direction
    });
    return { items: data as Clip[], total, page, pageSize };
  }

  const lower = keyword.toLowerCase();
  const offset = (page - 1) * pageSize;
  let skipped = 0;
  const items: Clip[] = [];
  let total = 0;

  await indexedDBManager.executeTransaction('clips', 'readonly', async (transaction) => {
    const store = transaction.objectStore('clips');
    const source = indexName ? store.index(indexName) : store;
    const request = source.openCursor(undefined, direction);

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as Clip;
        const title = (record.title ?? '').toLowerCase();
        const url = (record.sourceUrl ?? '').toLowerCase();
        const content = (record.textContent ?? '').toLowerCase();

        let matched = false;
        switch (type) {
          case 'title':
            matched = title.includes(lower);
            break;
          case 'website':
            matched = url.includes(lower);
            break;
          case 'content':
            matched = content.includes(lower);
            break;
          default:
            matched = title.includes(lower) || url.includes(lower) || content.includes(lower);
            break;
        }

        if (matched) {
          total += 1;
          if (skipped < offset) {
            skipped += 1;
          } else if (items.length < pageSize) {
            items.push(record);
          }
        }

        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });

  return { items, total, page, pageSize };
}

/**
 * 获取错误日志列表
 */
export async function getErrorLogs(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<ErrorLogRecord[]> {
  await indexedDBManager.init();
  
  return IndexedDBQuery.getAll('errorLogs', {
    indexName: 'time',
    direction: 'desc', // 最新的在前
    limit: options.limit,
    offset: options.offset
  });
}

/**
 * 清空错误日志
 */
export async function clearErrorLogs(): Promise<void> {
  await indexedDBManager.init();
  await indexedDBManager.clear('errorLogs');
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
  await indexedDBManager.init();
  
  const clips = await getClipsFromStorage();
  const errorLogs = await getErrorLogs({ limit: 1000 });
  
  return {
    clips,
    errorLogs,
    exportedAt: new Date().toISOString(),
    version: '2.0' // IndexedDB 版本
  };
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
  await indexedDBManager.init();
  
  let clipsImported = 0;
  let errorLogsImported = 0;
  
  // 导入 clips
  if (Array.isArray(data.clips) && data.clips.length > 0) {
    const { saveClips } = await import('./storage');
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
