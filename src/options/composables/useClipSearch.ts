import { ref, watch } from 'vue';
import { parseSearchQuery } from '@/utils/search/query-parser';
import { searchClips } from '@/background/api';
import type { Clip } from '@/types/clip';

/** 剪辑搜索组合：支持全文与指令 @title/@website/@content。 */
export function useClipSearch() {
  const searchQuery = ref('');
  const searchResults = ref<Clip[]>([]);
  const searchTotal = ref(0);
  const isSearching = ref(false);

  // 执行搜索并更新结果与总数
  async function performSearch(page: number, pageSize: number): Promise<void> {
    const parsed = parseSearchQuery(searchQuery.value);
    
    isSearching.value = true;
    try {
      const result = await searchClips({
        keyword: parsed.keyword,
        type: parsed.type,
        page,
        pageSize
      });
      
      searchResults.value = result.items;
      searchTotal.value = result.total;
    } catch (error) {
      console.error('[Clip Search] Search failed:', error);
      searchResults.value = [];
      searchTotal.value = 0;
      throw error;
    } finally {
      isSearching.value = false;
    }
  }

  // 清空搜索状态
  function clearSearch(): void {
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
