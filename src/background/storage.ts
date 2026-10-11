import type { Clip } from '@/types/clip';
import { IndexedDB, indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { IndexedDBError } from '@/types/indexeddb';
import { cacheManager } from './storage/cache-manager';
import { syncManager } from './storage/sync-manager';
import { normalizeClips } from './storage/utils/clip-normalizer';
import { createIndexKeys } from './storage/utils/url-normalizer';

async function ensureInitialized(): Promise<void> {
  if (indexedDBManager.isInitialized()) {
    return;
  }

  await indexedDBManager.init();
}

// 获取所有剪辑（缓存优先）
export async function getClips(): Promise<Clip[]> {
  await ensureInitialized();
  return cacheManager.get(() => loadClipsFromStorage());
}

// 按 URL 获取剪辑（使用缓存）
export async function getClipsForUrl(url: string): Promise<Clip[]> {
  await ensureInitialized();
  return cacheManager.getByUrl(url, () => loadClipsFromStorage(), loadClipsForBase);
}

// 替换全部剪辑：删除和写入必须一起提交或回滚。
export async function saveClips(clips: Clip[]): Promise<void> {
  const normalizedClips = normalizeClips(clips);
  if (normalizedClips.length !== clips.length) {
    throw new Error('Clips contain invalid records or duplicate IDs');
  }

  await ensureInitialized();
  await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    store.clear();
    for (const clip of normalizedClips) IndexedDB.writeRecord(store, 'put', clip);
  });

  cacheManager.clear();
  syncManager.notifyChange();
}

// 添加单个剪辑：只去重同页面的同高亮，不淘汰历史记录。
export async function addClip(clip: Clip): Promise<void> {
  const normalizedClip = normalizeClips([clip])[0];
  if (!normalizedClip) {
    throw new Error('Invalid clip');
  }

  await ensureInitialized();
  const countDelta = await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    const [previous, matches] = await Promise.all([
      requestResult<Clip | undefined>(store.get(normalizedClip.id)),
      normalizedClip.highlightId
        ? requestResult<Clip[]>(store.index('highlightId').getAll(normalizedClip.highlightId))
        : Promise.resolve([])
    ]);
    const duplicates = matches.filter(existing =>
      existing.sourceUrl === normalizedClip.sourceUrl &&
      existing.id !== normalizedClip.id
    );
    for (const existing of duplicates) store.delete(existing.id);
    IndexedDB.writeRecord(store, 'put', normalizedClip);
    return (previous ? 0 : 1) - duplicates.length;
  });

  cacheManager.clear();
  syncManager.notifyChange(countDelta);
}

// 按 ID 删除，不把其他页面的旧快照写回数据库。
export async function deleteClip(id: string): Promise<Clip | undefined> {
  await ensureInitialized();
  const deleted = await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    const deleted = await requestResult<Clip | undefined>(store.get(id));
    store.delete(id);
    return IndexedDB.readRecord(store, deleted);
  });

  cacheManager.clear();
  syncManager.notifyChange(deleted ? -1 : 0);
  return deleted;
}

export async function clearClips(): Promise<void> {
  await saveClips([]);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

// 读取失败必须向上抛出，不能把失败缓存成“没有摘录”。
async function loadClipsForBase(base: string): Promise<Clip[] | null> {
  return indexedDBManager.executeTransaction('clips', 'readonly', async transaction => {
    const store = transaction.objectStore('clips');
    if (store.keyPath !== 'id') return null;
    const index = store.index('urlKey');
    const range = IDBKeyRange.bound([base], [base, []]);
    const [legacy, ids] = await Promise.all([
      requestResult(index.count([''])),
      requestResult(index.getAllKeys(range, 2501))
    ]);
    // shortcut: 页缓存最多 2500 条，更大子集沿用全库读取；更换硬件或正文规模时重新测量边界。
    if (legacy || ids.length > 2500) return null;
    if (ids.length >= 64) {
      // 小库的大比例命中用批量读取更快；只探测一批键，避免全库计数。
      const keys = await requestResult(store.getAllKeys(undefined, 257));
      if (keys.length <= 256 && ids.length * 2 >= keys.length) return null;
    }
    const clips = await requestResult<Clip[]>(index.getAll(range));
    if (clips.length !== ids.length) return null;
    for (const url of new Set(clips.map(clip => clip.sourceUrl))) {
      if (createIndexKeys(url).at(-1) !== base) return null;
    }
    return clips.reverse();
  });
}

async function loadClipsFromStorage(): Promise<Clip[]> {
  // 内部快照随即经缓存标准化；不先删除字段，避免临时对象分配。
  return indexedDBManager.executeTransaction('clips', 'readonly', async transaction => {
    const request = transaction.objectStore('clips').index('createdAt_id').getAll();
    return new Promise<Clip[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => reject(new IndexedDBError(
        'Failed to query records', 'QUERY_ERROR', request.error || undefined
      ));
    });
  });
}

export async function refreshCache(): Promise<Clip[]> {
  cacheManager.clear();
  return getClips();
}

// 获取存储统计（数量、大小、最早/最新时间）
export async function getStorageStats(): Promise<{
  totalClips: number;
  totalSize: number;
  oldestClip?: string;
  newestClip?: string;
}> {
  await ensureInitialized();
  
  try {
    const clips = await cacheManager.get(() => loadClipsFromStorage());
    const totalClips = clips.length;
    let totalSize = 0;
    let oldestClip: string | undefined;
    let newestClip: string | undefined;
    let oldestTs = Number.POSITIVE_INFINITY;
    let newestTs = 0;

    for (const clip of clips) {
      if (typeof clip.textContent === 'string') totalSize += clip.textContent.length;
      if (typeof clip.htmlContent === 'string') totalSize += clip.htmlContent.length;
      if (typeof clip.sourceUrl === 'string') totalSize += clip.sourceUrl.length;
      if (typeof clip.title === 'string') totalSize += clip.title.length;
      if (typeof clip.contextBefore === 'string') totalSize += clip.contextBefore.length;
      if (typeof clip.contextAfter === 'string') totalSize += clip.contextAfter.length;
      if (typeof clip.anchorSelector === 'string') totalSize += clip.anchorSelector.length;
      if (typeof clip.highlightId === 'string') totalSize += clip.highlightId.length;

      if (clip.createdAt) {
        const ts = new Date(clip.createdAt).getTime();
        if (Number.isFinite(ts)) {
          if (ts < oldestTs) { oldestTs = ts; oldestClip = clip.createdAt; }
          if (ts > newestTs) { newestTs = ts; newestClip = clip.createdAt; }
        }
      }
    }

    return { totalClips, totalSize, oldestClip, newestClip };
  } catch (error) {
    throw new IndexedDBError(
      'Failed to get storage stats',
      'STATS_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

export { IndexedDBQuery };




