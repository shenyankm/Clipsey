import { ref, computed, watch, type Ref } from 'vue';
import type { Clip } from '@/types/clip';

/**
 * Clip分页组合式函数
 * 管理分页状态和分页数据
 */
export function useClipPagination(
  allClips: Ref<Clip[]>,
  pageSize: number = 20
) {
  const currentPage = ref(1);
  const totalItems = computed(() => allClips.value.length);
  const totalPages = computed(() => Math.ceil(totalItems.value / pageSize));

  /**
   * 当前页的数据
   */
  const paginatedClips = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    const end = start + pageSize;
    return allClips.value.slice(start, end);
  });

  /**
   * 跳转到指定页
   */
  function goToPage(page: number): void {
    if (page < 1 || page > totalPages.value) return;
    currentPage.value = page;
  }

  /**
   * 下一页
   */
  function nextPage(): void {
    if (currentPage.value < totalPages.value) {
      currentPage.value++;
    }
  }

  /**
   * 上一页
   */
  function prevPage(): void {
    if (currentPage.value > 1) {
      currentPage.value--;
    }
  }

  /**
   * 重置到第一页
   */
  function resetPage(): void {
    currentPage.value = 1;
  }

  // 当数据变化时,如果当前页超出范围,重置到第一页
  watch(totalPages, (newTotalPages) => {
    if (currentPage.value > newTotalPages && newTotalPages > 0) {
      currentPage.value = 1;
    }
  });

  return {
    currentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedClips,
    goToPage,
    nextPage,
    prevPage,
    resetPage
  };
}
