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
    const lower = keyword.toLowerCase();
    const offset = (page - 1) * pageSize;
    const { getClips } = await import('@/background/storage');
    const clips = await getClips();
    const matches = clips.filter((clip) => this.matchesSearch(clip, type, lower));
    const sorted = this.sortClips(matches, sortBy, sortOrder);
    const total = sorted.length;
    const items = sorted.slice(offset, offset + pageSize);
    return { items, total, page, pageSize };
  }

  /** 判断记录是否满足过滤条件。 */
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

  private sortClips(clips: Clip[], sortBy: SortBy, sortOrder: 'asc' | 'desc'): Clip[] {
    const factor = sortOrder === 'asc' ? 1 : -1;
    const access = (clip: Clip): string | number => {
      switch (sortBy) {
        case 'sourceUrl':
          return (clip.sourceUrl ?? '').toLowerCase();
        case 'textContent':
          return (clip.textContent ?? '').toLowerCase();
        case 'title':
          return (clip.title ?? '').toLowerCase();
        default:
          return clip.createdAt ? new Date(clip.createdAt).getTime() : 0;
      }
    };

    return [...clips].sort((a, b) => {
      const left = access(a);
      const right = access(b);
      if (left === right) {
        return 0;
      }
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor;
      }
      return (left < right ? -1 : 1) * factor;
    });
  }
}

// 单例
export const searchService = new SearchService();
