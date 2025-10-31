import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';

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

export async function getClips(): Promise<Clip[]> {
  const clips = await indexedDBManager.getAllData('clips');
  return clips as Clip[];
}

export async function deleteClipById(id: string): Promise<void> {
  await indexedDBManager.deleteData('clips', id);
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
