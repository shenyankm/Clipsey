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

/** 搜索服务：支持无关键字分页与关键字过滤。 */
export class SearchService {
  async search(query: SearchQuery): Promise<SearchResult> {
    const page = Math.max(1, (query.page ?? 1) | 0);
    const pageSize = Math.max(1, Math.min(100, (query.pageSize ?? 20) | 0));
    const keyword = (query.keyword ?? '').trim().toLowerCase();
    const fields: (keyof Clip)[] =
      query.type === 'title' ? ['title'] :
      query.type === 'website' ? ['sourceUrl'] :
      query.type === 'content' ? ['textContent'] : ['title', 'sourceUrl', 'textContent'];

    if (query.sortBy === 'title') {
      // shortcut: 标题排序读取全部候选记录；规模导致卡顿时升级含空标题的数据库索引。
      const clips = await IndexedDBQuery.getAll('clips');
      const matches = clips.filter(clip => !keyword || fields.some(field =>
        typeof clip[field] === 'string' && clip[field].toLowerCase().includes(keyword)
      ));
      const direction = query.sortOrder === 'asc' ? 1 : -1;
      matches.sort((a, b) => direction * ((a.title ?? '').localeCompare(b.title ?? '') || a.id.localeCompare(b.id)));
      return { items: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize };
    }

    const options = {
      indexName: query.sortBy ?? 'createdAt',
      direction: query.sortOrder === 'asc' ? 'next' as const : 'prev' as const
    };
    if (!keyword) {
      const { data, total } = await IndexedDBQuery.paginate('clips', page, pageSize, options);
      return { items: data, total, page, pageSize };
    }
    return IndexedDBQuery.filterByKeywordPaged('clips', keyword, fields, page, pageSize, options);
  }
}

// 单例
export const searchService = new SearchService();
