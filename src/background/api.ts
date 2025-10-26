import type { Clip } from '@/types/clip';

export interface SyncResponse {
  success: boolean;
  syncedAt: string;
}

/**
 * Placeholder remote sync implementation.
 * Replace with real HTTP logic that talks to your backend.
 */
export async function syncClips(_clips: Clip[]): Promise<SyncResponse> {
  return {
    success: true,
    syncedAt: new Date().toISOString()
  };
}
