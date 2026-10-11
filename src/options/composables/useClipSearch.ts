import { ref, watch } from 'vue';
import { parseSearchQuery } from '@/utils/search/query-parser';
import { searchClips } from '@/background/api';
import type { SearchQuery } from '@/background/services/search-service';
import type { Clip } from '@/types/clip';

/** 剪辑搜索组合：支持全文与指令 @title/@website/@content。 */
type SortOptions = Pick<SearchQuery, 'sortBy' | 'sortOrder'>;

export function useClipSearch() {
  const searchQuery = ref('');
  const searchResults = ref<Clip[]>([]);
  const searchTotal = ref(0);
  const isSearching = ref(false);
  let latestRequest = 0;

  watch(searchQuery, () => {
    latestRequest += 1;
    isSearching.value = false;
  }, { flush: 'sync' });

  // 执行搜索并更新结果与总数
  async function performSearch(
    page: number,
    pageSize: number,
    sortOptions: SortOptions = {}
  ): Promise<void> {
    const parsed = parseSearchQuery(searchQuery.value);
    const request = ++latestRequest;
    
    isSearching.value = true;
    try {
      const result = await searchClips({
        keyword: parsed.keyword,
        type: parsed.type,
        page,
        pageSize,
        ...sortOptions
      });
      
      if (request !== latestRequest) return;
      searchResults.value = result.items;
      searchTotal.value = result.total;
    } catch (error) {
      if (request !== latestRequest) return;
      console.error('[Clip Search] Search failed:', error);
      searchResults.value = [];
      searchTotal.value = 0;
      throw error;
    } finally {
      if (request === latestRequest) isSearching.value = false;
    }
  }

  // 清空搜索状态
  function clearSearch(): void {
    latestRequest += 1;
    isSearching.value = false;
    searchQuery.value = '';
    searchResults.value = [];
    searchTotal.value = 0;
  }

  return {
    searchQuery,
    searchResults,
    searchTotal,
    isSearching,
    performSearch,
    clearSearch
  };
}
