import type { Clip } from '@/types/clip';
import { addClip, clearClips, getClips, getClipsForUrl, saveClips } from '@/background/storage';

/** 剪藏数据服务：封装读/写/查询并与 storage.ts 接口兼容。 */
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