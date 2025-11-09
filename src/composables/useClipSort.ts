import { computed, type Ref } from 'vue';
import type { Clip } from '@/types/clip';

export type SortOrder = 'asc' | 'desc';

/**
 * Clip排序组合式函数
 * 按创建时间对Clips进行排序(默认降序 - 最新在前)
 */
export function useClipSort(clips: Ref<Clip[]>, order: Ref<SortOrder> | SortOrder = 'desc') {
  const sortedClips = computed(() => {
    const orderValue = typeof order === 'string' ? order : order.value;
    
    return [...clips.value].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return orderValue === 'desc' ? dateB - dateA : dateA - dateB;
    });
  });
  
  return { sortedClips };
}
