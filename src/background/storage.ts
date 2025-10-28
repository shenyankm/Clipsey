import type { Clip } from '@/types/clip';

const STORAGE_KEY = 'clips';
const MAX_CLIP_ENTRIES = 200;

type ClipIndex = Map<string, Clip[]>;

let cachedClips: Clip[] | null = null;
let clipIndex: ClipIndex = new Map();
let inflightLoad: Promise<Clip[]> | null = null;

function getStorage(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function getClips(): Promise<Clip[]> {
  const clips = await getCachedClips();
  return cloneClips(clips);
}

export async function getClipsForUrl(url: string): Promise<Clip[]> {
  await getCachedClips();
  const matches = lookupClipsForUrl(url);
  return cloneClips(matches);
}

export async function saveClips(clips: Clip[]): Promise<void> {
  updateCache(clips);
  const snapshot = cloneClips(cachedClips ?? []);
  await getStorageSet({ [STORAGE_KEY]: snapshot });
}

export async function addClip(clip: Clip): Promise<void> {
  const normalizedClip = normalizeClips([clip])[0];
  if (!normalizedClip) {
    return;
  }

  const existing = await getClips();
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

  filtered.unshift({ ...normalizedClip });
  if (filtered.length > MAX_CLIP_ENTRIES) {
    filtered.length = MAX_CLIP_ENTRIES;
  }
  await saveClips(filtered);
}

export async function clearClips(): Promise<void> {
  await saveClips([]);
}

function updateCache(clips: Clip[]): void {
  const normalized = normalizeClips(clips);
  cachedClips = cloneClips(normalized);
  clipIndex = buildClipIndex(cachedClips);
}

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

    normalized.push({
      id,
      sourceUrl: typeof clip.sourceUrl === 'string' ? clip.sourceUrl : '',
      title: typeof clip.title === 'string' ? clip.title : undefined,
      textContent,
      htmlContent: typeof clip.htmlContent === 'string' ? clip.htmlContent : undefined,
      createdAt:
        typeof clip.createdAt === 'string' ? clip.createdAt : new Date().toISOString(),
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

function cloneClips(clips: Clip[]): Clip[] {
  return clips.map(clip => ({ ...clip }));
}

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

async function loadClipsFromStorage(): Promise<Clip[]> {
  const result = await getStorageGet<{ clips?: Clip[] }>({ [STORAGE_KEY]: [] });
  const clips = Array.isArray(result[STORAGE_KEY]) ? (result[STORAGE_KEY] as Clip[]) : [];
  return normalizeClips(clips);
}

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

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

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

function isSupportedProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

async function getStorageGet<T>(query: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      getStorage().get(query, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(result as T);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getStorageSet(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      getStorage().set(value, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
      return;
    }

    const change = changes[STORAGE_KEY];
    const newValue = Array.isArray(change?.newValue) ? (change?.newValue as Clip[]) : [];
    updateCache(newValue);
  });
}

function createFallbackId(clip: Clip): string {
  if (clip.highlightId) {
    return clip.highlightId;
  }
  if (clip.textContent) {
    return `clip-${hashString(clip.textContent)}`;
  }
  return `clip-${Date.now()}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
