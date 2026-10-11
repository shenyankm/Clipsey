import type { Clip } from '@/types/clip';
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

/** 规范化排序选项。 */
function normalizeSort(query: SearchQuery): { indexName?: string; direction: 'next' | 'prev' } {
  const sortBy = query.sortBy ?? 'createdAt';
  const sortOrder = query.sortOrder ?? 'desc';
  const indexMap: Record<Exclude<SortBy, 'title'>, string> = {
    createdAt: 'createdAt',
    sourceUrl: 'sourceUrl',
    textContent: 'textContent'
  };
  const indexName = sortBy === 'title' ? 'createdAt' : indexMap[sortBy as Exclude<SortBy, 'title'>];
  const direction = sortOrder === 'asc' ? 'next' : 'prev';
  return { indexName, direction };
}

/** 搜索服务：支持无关键字分页与关键字过滤。 */
export class SearchService {
  async search(query: SearchQuery): Promise<SearchResult> {
    const page = Math.max(1, (query.page ?? 1) | 0);
    const pageSize = Math.max(1, Math.min(100, (query.pageSize ?? 20) | 0));
    const keyword = (query.keyword ?? '').trim();
    const type: SearchType = (query.type ?? 'all');

    const { indexName, direction } = normalizeSort(query);

    if (!keyword) {
      return this.paginateWithoutKeyword(page, pageSize, indexName, direction);
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder: 'asc' | 'desc' = query.sortOrder ?? 'desc';
    return this.searchWithKeyword(keyword, type, page, pageSize, sortBy, sortOrder);
  }

  /** 无关键字的分页查询。 */
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

  /** 关键字过滤搜索。 */
  private async searchWithKeyword(
    keyword: string,
    type: SearchType,
    page: number,
    pageSize: number,
    sortBy: SortBy,
    sortOrder: 'asc' | 'desc'
  ): Promise<SearchResult> {
    const { indexName, direction } = normalizeSort({ sortBy, sortOrder });
    const fields: (keyof Clip)[] =
      type === 'title' ? ['title'] :
      type === 'website' ? ['sourceUrl'] :
      type === 'content' ? ['textContent'] : ['title', 'sourceUrl', 'textContent'];

    const result = await IndexedDBQuery.filterByKeywordPaged('clips', keyword, fields as any, page, pageSize, {
      indexName,
      direction
    });
    return { items: result.items as Clip[], total: result.total, page: result.page, pageSize: result.pageSize };
  }


}

// 单例
export const searchService = new SearchService();
