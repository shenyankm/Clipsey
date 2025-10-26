import type { Clip } from '@/types/clip';

const STORAGE_KEY = 'clips';
const MAX_CLIP_ENTRIES = 200;

function getStorage(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function getClips(): Promise<Clip[]> {
  const result = await getStorageGet<{ clips?: Clip[] }>({ [STORAGE_KEY]: [] });
  return result[STORAGE_KEY] ?? [];
}

export async function saveClips(clips: Clip[]): Promise<void> {
  await getStorageSet({ [STORAGE_KEY]: clips });
}

export async function addClip(clip: Clip): Promise<void> {
  const existing = await getClips();
  existing.unshift(clip);
  if (existing.length > MAX_CLIP_ENTRIES) {
    existing.length = MAX_CLIP_ENTRIES;
  }
  await saveClips(existing);
}

export async function clearClips(): Promise<void> {
  await saveClips([]);
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
