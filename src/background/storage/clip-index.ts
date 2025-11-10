import type { Clip } from '@/types/clip';
import { createIndexKeys } from './utils/url-normalizer';

export type ClipIndex = Map<string, Clip[]>;

/** 构建剪辑索引：基于 URL 的多级键提升查询效率。 */
export function buildClipIndex(clips: Clip[]): ClipIndex {
  const index: ClipIndex = new Map();

  for (const clip of clips) {
    if (!clip?.sourceUrl) {
      continue;
    }

    const keys = createIndexKeys(clip.sourceUrl);
    if (!keys.length) {
      continue;
    }

    for (const key of keys) {
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(clip);
      } else {
        index.set(key, [clip]);
      }
    }
  }

  return index;
}

/** 按 URL 查找剪辑：支持精确与忽略查询参数的匹配。 */
export function lookupClipsForUrl(index: ClipIndex, url: string): Clip[] {
  if (!index.size) {
    return [];
  }
  
  const keys = createIndexKeys(url);
  if (!keys.length) {
    return [];
  }

  const seen = new Set<string>();
  const matches: Clip[] = [];

  for (const key of keys) {
    const bucket = index.get(key);
    if (!bucket?.length) {
      continue;
    }

    for (const clip of bucket) {
      const dedupeKey = clip?.highlightId || clip?.id;
      if (!dedupeKey || seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      matches.push(clip);
    }
  }

  return matches;
}
