import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { IndexedDBError } from '@/types/indexeddb';
import { cacheManager } from './storage/cache-manager';
import { syncManager, storage } from './storage/sync-manager';
import { normalizeClips } from './storage/utils/clip-normalizer';

let initAttempt: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (indexedDBManager.isInitialized()) {
    return;
  }

  if (!initAttempt) {
    initAttempt = indexedDBManager.init().catch(error => {
      initAttempt = null;
      throw error;
    });
  }

  await initAttempt;
}

// 获取所有剪辑（缓存优先）
export async function getClips(): Promise<Clip[]> {
  await ensureInitialized();
  return cacheManager.get(() => loadClipsFromStorage());
}

// 按 URL 获取剪辑（使用缓存）
export async function getClipsForUrl(url: string): Promise<Clip[]> {
  await ensureInitialized();
  await cacheManager.get(() => loadClipsFromStorage());
  return cacheManager.getByUrl(url);
}

// 替换全部剪辑：删除和写入必须一起提交或回滚。
export async function saveClips(clips: Clip[]): Promise<void> {
  const normalizedClips = normalizeClips(clips);
  if (normalizedClips.length !== clips.length) {
    throw new Error('Clips contain invalid records or duplicate IDs');
  }

  await ensureInitialized();
  const oldClips = await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    const currentClips = await requestResult<Clip[]>(store.getAll());
    store.clear();
    for (const clip of normalizedClips) store.put(clip);
    return currentClips;
  });

  cacheManager.clear();
  syncManager.notifyChange(oldClips, normalizedClips);
}

// 添加单个剪辑：只去重同页面的同高亮，不淘汰历史记录。
export async function addClip(clip: Clip): Promise<void> {
  const normalizedClip = normalizeClips([clip])[0];
  if (!normalizedClip) {
    throw new Error('Invalid clip');
  }

  await ensureInitialized();
  const oldClips = await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    const currentClips = await requestResult<Clip[]>(store.getAll());
    const duplicates = currentClips.filter(existing =>
      normalizedClip.highlightId &&
      existing.highlightId === normalizedClip.highlightId &&
      existing.sourceUrl === normalizedClip.sourceUrl &&
      existing.id !== normalizedClip.id
    );
    for (const existing of duplicates) store.delete(existing.id);
    store.put(normalizedClip);
    return currentClips;
  });

  const newClips = oldClips.filter(existing =>
    existing.id !== normalizedClip.id &&
    !(normalizedClip.highlightId &&
      existing.highlightId === normalizedClip.highlightId &&
      existing.sourceUrl === normalizedClip.sourceUrl)
  );
  newClips.push(normalizedClip);
  cacheManager.clear();
  syncManager.notifyChange(oldClips, newClips);
}

// 按 ID 删除，不把其他页面的旧快照写回数据库。
export async function deleteClip(id: string): Promise<Clip | undefined> {
  await ensureInitialized();
  const oldClips = await indexedDBManager.executeTransaction('clips', 'readwrite', async transaction => {
    const store = transaction.objectStore('clips');
    const currentClips = await requestResult<Clip[]>(store.getAll());
    store.delete(id);
    return currentClips;
  });

  cacheManager.clear();
  syncManager.notifyChange(oldClips, oldClips.filter(clip => clip.id !== id));
  return oldClips.find(clip => clip.id === id);
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
async function loadClipsFromStorage(): Promise<Clip[]> {
  const clips = await IndexedDBQuery.getAll('clips', {
    indexName: 'createdAt_id',
    direction: 'desc'
  });
  return normalizeClips(clips);
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

// 导出IndexedDBQuery和storage API
export { IndexedDBQuery, storage };




