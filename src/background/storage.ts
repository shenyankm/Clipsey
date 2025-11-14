import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { IndexedDBError } from '@/types/indexeddb';
import { cacheManager } from './storage/cache-manager';
import { syncManager, storage } from './storage/sync-manager';
import { normalizeClips } from './storage/utils/clip-normalizer';

const MAX_CLIP_ENTRIES = 200;

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

// 保存剪辑：清空旧库、批量写入并更新缓存与通知
export async function saveClips(clips: Clip[]): Promise<void> {
  await ensureInitialized();
  
  try {
    const oldClips = cacheManager.has() ? await getClips() : [];
    const normalizedClips = normalizeClips(clips);
    const oldIds = new Set(oldClips.map(c => c.id));
    const newIds = new Set(normalizedClips.map(c => c.id));
    const toDelete: string[] = [];
    for (const id of oldIds) {
      if (!newIds.has(id)) toDelete.push(id);
    }
    if (toDelete.length > 0) {
      await IndexedDBQuery.bulkDelete('clips', toDelete, { batchSize: 100 });
    }
    if (normalizedClips.length > 0) {
      await IndexedDBQuery.bulkPut('clips', normalizedClips, { batchSize: 50 });
    }
    
    // 更新缓存
    cacheManager.update(normalizedClips);
    
    // 通知变化
    syncManager.notifyChange(oldClips, normalizedClips);
    
  } catch (error) {
    throw new IndexedDBError(
      'Failed to save clips',
      'SAVE_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

// 添加单个剪辑（去重同高亮并限制总数）
export async function addClip(clip: Clip): Promise<void> {
  await ensureInitialized();
  
  const normalizedClip = normalizeClips([clip])[0];
  if (!normalizedClip) {
    return;
  }

  try {
    const oldClips = await getClips();

    await indexedDBManager.executeTransaction('clips', 'readwrite', async (transaction) => {
      const store = transaction.objectStore('clips');
      await deleteDuplicateHighlights(store, normalizedClip);
      await putClipRecord(store, normalizedClip);
      await trimClipsToLimit(store, MAX_CLIP_ENTRIES);
    });

    const newClips = await reloadCacheFromStorage();
    syncManager.notifyChange(oldClips, newClips);
  } catch (error) {
    throw new IndexedDBError(
      'Failed to add clip',
      'ADD_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

// 清空所有剪辑
export async function clearClips(): Promise<void> {
  await ensureInitialized();
  await saveClips([]);
}

// 从 IndexedDB 加载剪辑并标准化
async function loadClipsFromStorage(): Promise<Clip[]> {
  try {
    const clips = await IndexedDBQuery.getAll('clips', {
      direction: 'desc'
    });
    
    return normalizeClips(clips);
  } catch (error) {
    console.error('Failed to load clips from IndexedDB:', error);
    return [];
  }
}

async function reloadCacheFromStorage(): Promise<Clip[]> {
  const clips = await loadClipsFromStorage();
  cacheManager.update(clips);
  return clips;
}

async function deleteDuplicateHighlights(store: IDBObjectStore, clip: Clip): Promise<void> {
  if (!clip.highlightId) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const index = store.index('highlightId');
    const request = index.openCursor(IDBKeyRange.only(clip.highlightId));

    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null;
      if (!cursor) {
        resolve();
        return;
      }

      const value = cursor.value as Clip;
      if (value.sourceUrl === clip.sourceUrl && value.id !== clip.id) {
        cursor.delete();
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to dedupe highlights'));
  });
}

async function putClipRecord(store: IDBObjectStore, clip: Clip): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = store.put(clip);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to write clip'));
  });
}

async function trimClipsToLimit(store: IDBObjectStore, limit: number): Promise<void> {
  const total = await new Promise<number>((resolve, reject) => {
    const countRequest = store.count();
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error ?? new Error('Failed to count clips'));
  });

  if (total <= limit) {
    return;
  }

  const deleteCount = total - limit;
  await new Promise<void>((resolve, reject) => {
    const index = store.index('createdAt');
    let removed = 0;
    const request = index.openCursor(undefined, 'next');

    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null;
      if (!cursor || removed >= deleteCount) {
        resolve();
        return;
      }

      cursor.delete();
      removed += 1;
      cursor.continue();
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to trim clips'));
  });
}

// 刷新缓存：强制重载 IndexedDB 数据
export async function refreshCache(): Promise<Clip[]> {
  cacheManager.clear();
  return cacheManager.get(() => loadClipsFromStorage());
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




