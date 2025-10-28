import type { Clip } from '@/types/clip';
import { IndexedDB } from './indexeddb';

export interface SyncResponse {
  success: boolean;
  syncedAt: string;
}

/**
 * 远程同步的占位实现，实际使用时请替换为真实的后端请求逻辑。
 */
export async function syncClips(_clips: Clip[]): Promise<SyncResponse> {
  return {
    success: true,
    syncedAt: new Date().toISOString()
  };
}

export async function getClips(): Promise<Clip[]> {
  const db = await IndexedDB.create('clipsey', 1);
  const clips = await db.getAllData('clips');
  return clips as Clip[];
}

export async function deleteClipById(id: string): Promise<void> {
  const db = await IndexedDB.create('clipsey', 1);
  await db.deleteData('clips', id);
}
