import { computed, type Ref } from 'vue';
import type { Clip } from '@/types/clip';

/**
 * URL匹配工具
 * 比较两个URL是否匹配(协议、主机名和路径相同)
 */
export function matchClipUrl(clipUrl: string, currentUrl: string): boolean {
  try {
    const clip = new URL(clipUrl);
    const current = new URL(currentUrl);
    return clip.protocol === current.protocol &&
           clip.hostname === current.hostname &&
           clip.pathname === current.pathname;
  } catch {
    return false;
  }
}

/**
 * Clip URL过滤组合式函数
 * 根据当前URL过滤匹配的Clips
 */
export function useClipFilter(clips: Ref<Clip[]>, currentUrl: Ref<string>) {
  const filteredClips = computed(() => {
    if (!currentUrl.value) return [];
    return clips.value.filter(clip => 
      clip.sourceUrl && matchClipUrl(clip.sourceUrl, currentUrl.value)
    );
  });
  
  return { filteredClips };
}
