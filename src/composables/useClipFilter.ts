import { computed, type Ref } from 'vue';
import type { Clip } from '@/types/clip';

/** URL 匹配：比较协议、主机名与路径是否一致。 */
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

/** 剪辑过滤：根据当前 URL 过滤匹配剪辑。 */
export function useClipFilter(clips: Ref<Clip[]>, currentUrl: Ref<string>) {
  const filteredClips = computed(() => {
    if (!currentUrl.value) return [];
    return clips.value.filter(clip => 
      clip.sourceUrl && matchClipUrl(clip.sourceUrl, currentUrl.value)
    );
  });
  
  return { filteredClips };
}
