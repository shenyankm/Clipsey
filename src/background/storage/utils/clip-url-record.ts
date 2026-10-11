import type { Clip } from '@/types/clip';
import { createIndexKeys } from './url-normalizer';
import { CLIP_URL_KEY } from '@/types/indexeddb';

export function clipUrlRecord(clip: Clip, id: IDBValidKey = clip.id) {
  // 异常旧记录可能影响全库去重，不能只标准化某个页面的子集。
  if (!clip || typeof clip !== 'object' || typeof clip.id !== 'string' || !clip.id || clip.id !== id || typeof clip.createdAt !== 'string') {
    return { id, key: [''] };
  }
  const base = typeof clip.sourceUrl === 'string' ? createIndexKeys(clip.sourceUrl).at(-1) : undefined;
  return { id, key: base ? [base, clip.createdAt, clip.id] : undefined };
}

export function withClipUrlKey(clip: Clip, id?: IDBValidKey) {
  if (Object.hasOwn(clip, CLIP_URL_KEY)) throw new Error('Clip contains a reserved URL-index field');
  // 快照先消除 getter；数组单独复制，保留稀疏元素和旧附加字段。
  const record = Array.isArray(clip) ? structuredClone(clip) : { ...clip };
  return Object.assign(record, { [CLIP_URL_KEY]: clipUrlRecord(record, id ?? record.id).key });
}
