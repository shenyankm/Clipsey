import type { Clip } from '@/types/clip';
import { addClip, clearClips, getClips, getClipsForUrl, saveClips } from '@/background/storage';

/**
 * ClipService 封装剪藏数据的核心业务逻辑。
 * 负责读/写/查询，并保持与原 storage.ts 的向后兼容接口。
 */
export class ClipService {
  async listAll(): Promise<Clip[]> {
    return getClips();
  }

  async listByUrl(url: string): Promise<Clip[]> {
    return getClipsForUrl(url);
  }

  async add(clip: Clip): Promise<void> {
    await addClip(clip);
  }

  async replaceAll(clips: Clip[]): Promise<void> {
    await saveClips(clips);
  }

  async clear(): Promise<void> {
    await clearClips();
  }
}

export const clipService = new ClipService();