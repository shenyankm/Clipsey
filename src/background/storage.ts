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
    
    // 清空现有数据
    await indexedDBManager.clear('clips');
    
    // 批量插入新数据
    if (normalizedClips.length > 0) {
      await IndexedDBQuery.bulkAdd('clips', normalizedClips, {
        batchSize: 50
      });
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
    const totalSize = JSON.stringify(clips).length;
    
    const sortedByDate = clips
      .filter(clip => clip.createdAt)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    
    return {
      totalClips,
      totalSize,
      oldestClip: sortedByDate[0]?.createdAt,
      newestClip: sortedByDate[sortedByDate.length - 1]?.createdAt
    };
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




