import type { Clip } from '@/types/clip';

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
