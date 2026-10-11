import type { Clip } from '@/types/clip';
import { createIndexKeys } from './url-normalizer';

export function clipUrlRecord(clip: Clip, id: IDBValidKey = clip.id) {
  // 异常旧记录可能影响全库去重，不能只标准化某个页面的子集。
  if (!clip || typeof clip !== 'object' || typeof clip.id !== 'string' || !clip.id || clip.id !== id || typeof clip.createdAt !== 'string') {
    return { id, key: [''] };
  }
  const base = typeof clip.sourceUrl === 'string' ? createIndexKeys(clip.sourceUrl).at(-1) : undefined;
  return { id, key: base ? [base, clip.createdAt, clip.id] : undefined };
}
