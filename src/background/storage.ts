import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { IndexedDBQuery } from './indexeddb-query';
import { IndexedDBError } from '@/types/indexeddb';

const MAX_CLIP_ENTRIES = 200;

type ClipIndex = Map<string, Clip[]>;

let cachedClips: Clip[] | null = null;
let clipIndex: ClipIndex = new Map();
let inflightLoad: Promise<Clip[]> | null = null;
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

/**
 * 获取所有clips
 */
export async function getClips(): Promise<Clip[]> {
  await ensureInitialized();
  const clips = await getCachedClips();
  return cloneClips(clips);
}

/**
 * 根据URL获取clips
 */
export async function getClipsForUrl(url: string): Promise<Clip[]> {
  await ensureInitialized();
  await getCachedClips();
  const matches = lookupClipsForUrl(url);
  return cloneClips(matches);
}

/**
 * 保存clips
 */
export async function saveClips(clips: Clip[]): Promise<void> {
  await ensureInitialized();
  
  try {
    const oldClips = cachedClips ? [...cachedClips] : [];
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
    updateCache(normalizedClips);
    
    // 通知变化,确保popup和其他监听者同步
    notifyStorageChange(oldClips, normalizedClips);
    
  } catch (error) {
    throw new IndexedDBError(
      'Failed to save clips',
      'SAVE_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 添加单个clip
 */
export async function addClip(clip: Clip): Promise<void> {
  await ensureInitialized();
  
  const normalizedClip = normalizeClips([clip])[0];
  if (!normalizedClip) {
    return;
  }

  try {
    const existing = await getClips();
    
    // 如果有highlightId，移除重复的highlight
    const filtered = normalizedClip.highlightId
      ? existing.filter(
          entry =>
            !(
              entry.highlightId &&
              entry.highlightId === normalizedClip.highlightId &&
              entry.sourceUrl === normalizedClip.sourceUrl
            )
        )
      : existing;

    // 添加新clip到开头
    filtered.unshift({ ...normalizedClip });
    
    // 限制数量
    if (filtered.length > MAX_CLIP_ENTRIES) {
      filtered.length = MAX_CLIP_ENTRIES;
    }
    
    await saveClips(filtered);
    
  } catch (error) {
    throw new IndexedDBError(
      'Failed to add clip',
      'ADD_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 清空所有clips
 */
export async function clearClips(): Promise<void> {
  await ensureInitialized();
  await saveClips([]);
}

/**
 * 更新缓存
 */
function updateCache(clips: Clip[]): void {
  const normalized = normalizeClips(clips);
  cachedClips = cloneClips(normalized);
  clipIndex = buildClipIndex(cachedClips);
}

/**
 * 标准化clips数据
 */
function normalizeClips(clips: Clip[]): Clip[] {
  const limited = clips.slice(0, MAX_CLIP_ENTRIES);
  const normalized: Clip[] = [];
  const seen = new Set<string>();
  
  for (const clip of limited) {
    if (!clip || typeof clip !== 'object') {
      continue;
    }

    const id = typeof clip.id === 'string' && clip.id ? clip.id : createFallbackId(clip);
    if (seen.has(id)) {
      continue;
    }

    const textContent = typeof clip.textContent === 'string' ? clip.textContent : '';
    if (!textContent) {
      continue;
    }

    const highlightId =
      typeof clip.highlightId === 'string' && clip.highlightId ? clip.highlightId : undefined;
    const contextBefore =
      typeof clip.contextBefore === 'string' ? clip.contextBefore : undefined;
    const contextAfter =
      typeof clip.contextAfter === 'string' ? clip.contextAfter : undefined;
    const anchorSelector =
      typeof clip.anchorSelector === 'string' ? clip.anchorSelector : undefined;
    const textOffset =
      typeof clip.textOffset === 'number' && Number.isFinite(clip.textOffset)
        ? clip.textOffset
        : undefined;
    const highlightStyle =
      clip.highlightStyle === 'inline' || clip.highlightStyle === 'overlay'
        ? clip.highlightStyle
        : highlightId
          ? 'inline'
          : undefined;

    const now = Date.now();
    normalized.push({
      id,
      sourceUrl: typeof clip.sourceUrl === 'string' ? clip.sourceUrl : '',
      title: typeof clip.title === 'string' ? clip.title : undefined,
      textContent,
      htmlContent: typeof clip.htmlContent === 'string' ? clip.htmlContent : undefined,
      createdAt: typeof clip.createdAt === 'string' ? clip.createdAt : new Date().toISOString(),
      updatedAt: new Date(now).toISOString(), // IndexedDB schema 新增字段
      highlightId,
      contextBefore,
      contextAfter,
      anchorSelector,
      textOffset,
      highlightStyle
    });
    seen.add(id);
  }

  return normalized;
}

/**
 * 克隆clips数组
 */
function cloneClips(clips: Clip[]): Clip[] {
  return clips.map(clip => ({ ...clip }));
}

/**
 * 获取缓存的clips
 */
async function getCachedClips(): Promise<Clip[]> {
  if (cachedClips) {
    return cachedClips;
  }

  if (!inflightLoad) {
    inflightLoad = loadClipsFromStorage()
      .then(clips => {
        updateCache(clips);
        return cachedClips ?? [];
      })
      .finally(() => {
        inflightLoad = null;
      });
  }

  return inflightLoad;
}

/**
 * 从IndexedDB加载clips
 */
async function loadClipsFromStorage(): Promise<Clip[]> {
  try {
    const clips = await IndexedDBQuery.getAll('clips', {
      direction: 'desc' // 按创建时间倒序
    });
    
    return normalizeClips(clips);
  } catch (error) {
    console.error('Failed to load clips from IndexedDB:', error);
    return [];
  }
}

/**
 * 根据URL查找clips
 */
function lookupClipsForUrl(url: string): Clip[] {
  if (!clipIndex.size) {
    return [];
  }
  
  const keys = createIndexKeys(url);
  if (!keys.length) {
    return [];
  }

  const seen = new Set<string>();
  const matches: Clip[] = [];

  for (const key of keys) {
    const bucket = clipIndex.get(key);
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

/**
 * 构建clip索引
 */
function buildClipIndex(clips: Clip[]): ClipIndex {
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

/**
 * 创建索引键
 */
function createIndexKeys(url: string): string[] {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  if (!isSupportedProtocol(parsed.protocol)) {
    return [];
  }

  const basePath = normalizePath(parsed.pathname);
  const baseKey = `${parsed.origin}${basePath}`;
  const keys: string[] = [baseKey];

  const normalizedSearch = normalizeSearch(parsed.search);
  if (normalizedSearch) {
    keys.unshift(`${baseKey}${normalizedSearch}`);
  }

  return keys;
}

/**
 * 标准化路径
 */
function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

/**
 * 标准化查询参数
 */
function normalizeSearch(search: string): string {
  if (!search || search === '?') {
    return '';
  }

  const params = new URLSearchParams(search);
  const entries = Array.from(params.entries());
  if (!entries.length) {
    return '';
  }

  entries.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1].localeCompare(b[1]);
    }
    return a[0].localeCompare(b[0]);
  });

  const serialized = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return serialized ? `?${serialized}` : '';
}

/**
 * 检查是否支持的协议
 */
function isSupportedProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * 创建备用ID
 */
function createFallbackId(clip: Clip): string {
  if (clip.highlightId) {
    return clip.highlightId;
  }
  if (clip.textContent) {
    return `clip-${hashString(clip.textContent)}`;
  }
  return `clip-${Date.now()}`;
}

/**
 * 字符串哈希
 */
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 监听IndexedDB变化（模拟chrome.storage.onChanged）
 */
let changeListeners: Array<(changes: any, areaName: string) => void> = [];

/**
 * 跨页面同步通道（使用 BroadcastChannel 实现同源页面通信）
 */
let syncChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel {
  if (!syncChannel) {
    syncChannel = new BroadcastChannel('clipsey-storage-sync');
  }
  return syncChannel;
}

export const storage = {
  onChanged: {
    addListener: (callback: (changes: any, areaName: string) => void) => {
      changeListeners.push(callback);
    },
    removeListener: (callback: (changes: any, areaName: string) => void) => {
      const index = changeListeners.indexOf(callback);
      if (index > -1) {
        changeListeners.splice(index, 1);
      }
    }
  }
};

/**
 * 触发变化事件
 * 优化：
 * 1. 使用 BroadcastChannel 实现跨页面同步，替代 chrome.storage.local
 * 2. 增加详细日志，便于调试数据同步问题
 * 3. 实现Popup和ClipManager的实时双向同步
 */
function notifyStorageChange(oldValue: Clip[], newValue: Clip[]): void {
  const changes = {
    clips: {
      oldValue,
      newValue
    }
  };
  
  // 记录变化详情(仅在开发模式下)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Storage Sync] Data changed:', {
      oldCount: oldValue.length,
      newCount: newValue.length,
      operation: newValue.length > oldValue.length ? 'ADD' : 
                 newValue.length < oldValue.length ? 'DELETE' : 'UPDATE',
      timestamp: new Date().toISOString()
    });
  }
  
  // 触发自定义监听器(兼容非Chrome环境)
  let customListenerCount = 0;
  changeListeners.forEach(listener => {
    try {
      listener(changes, 'local');
      customListenerCount++;
    } catch (error) {
      console.error('[Storage Sync] Custom listener error:', error);
    }
  });
  
  if (process.env.NODE_ENV === 'development' && customListenerCount > 0) {
    console.log(`[Storage Sync] Notified ${customListenerCount} custom listener(s)`);
  }
  
  // 使用 BroadcastChannel 实现跨页面同步
  try {
    const channel = getSyncChannel();
    channel.postMessage({
      type: 'CLIPS_CHANGED',
      timestamp: Date.now(),
      oldCount: oldValue.length,
      newCount: newValue.length
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Storage Sync] BroadcastChannel message sent successfully');
    }
  } catch (error) {
    console.error('[Storage Sync] Failed to send BroadcastChannel message:', error);
  }
}

// 导出额外的IndexedDB特定功能
export { IndexedDBQuery };

/**
 * 刷新缓存 - 从 IndexedDB 重新加载数据
 */
export async function refreshCache(): Promise<void> {
  cachedClips = null;
  inflightLoad = null;
  await getCachedClips();
}
export async function getStorageStats(): Promise<{
  totalClips: number;
  totalSize: number;
  oldestClip?: string;
  newestClip?: string;
}> {
  await ensureInitialized();
  
  try {
    const clips = await getCachedClips();
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
