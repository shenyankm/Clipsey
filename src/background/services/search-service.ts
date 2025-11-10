import type { Clip } from '@/types/clip';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';

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

/**
 * 标准化排序选项
 */
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

/** 搜索服务：支持索引分页与关键词过滤，优先无关键词走高效索引分页。 */
export class SearchService {
  async search(query: SearchQuery): Promise<SearchResult> {
    const page = Math.max(1, (query.page ?? 1) | 0);
    const pageSize = Math.max(1, Math.min(100, (query.pageSize ?? 20) | 0));
    const keyword = (query.keyword ?? '').trim();
    const type: SearchType = (query.type ?? 'all');

    const { indexName, direction } = normalizeSort(query);

    // 无关键词：直接分页
    if (!keyword) {
      return this.paginateWithoutKeyword(page, pageSize, indexName, direction);
    }

    // 有关键词：过滤搜索
    return this.searchWithKeyword(keyword, type, page, pageSize, indexName, direction);
  }

  /**
   * 无关键词的分页查询
   */
  private async paginateWithoutKeyword(
    page: number,
    pageSize: number,
    indexName?: string,
    direction: 'next' | 'prev' = 'prev'
  ): Promise<SearchResult> {
    const { data, total } = await IndexedDBQuery.paginate('clips', page, pageSize, {
      indexName,
      direction
    });
    return { items: data as Clip[], total, page, pageSize };
  }

  /**
   * 带关键词的搜索
   */
  private async searchWithKeyword(
    keyword: string,
    type: SearchType,
    page: number,
    pageSize: number,
    indexName?: string,
    direction: 'next' | 'prev' = 'prev'
  ): Promise<SearchResult> {
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
          
          if (this.matchesSearch(record, type, lower)) {
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
   * 检查记录是否匹配搜索条件
   */
  private matchesSearch(record: Clip, type: SearchType, lowerKeyword: string): boolean {
    const title = (record.title ?? '').toLowerCase();
    const url = (record.sourceUrl ?? '').toLowerCase();
    const content = (record.textContent ?? '').toLowerCase();

    switch (type) {
      case 'title':
        return title.includes(lowerKeyword);
      case 'website':
        return url.includes(lowerKeyword);
      case 'content':
        return content.includes(lowerKeyword);
      default:
        return title.includes(lowerKeyword) || url.includes(lowerKeyword) || content.includes(lowerKeyword);
    }
  }
}

// 导出单例实例
export const searchService = new SearchService();
