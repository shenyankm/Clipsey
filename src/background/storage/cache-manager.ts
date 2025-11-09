import type { Clip } from '@/types/clip';
import { normalizeClips } from '../storage/utils/clip-normalizer';
import { buildClipIndex, lookupClipsForUrl, type ClipIndex } from '../storage/clip-index';

/**
 * Clips缓存管理器
 * 负责内存缓存的读取、更新和索引维护
 */
export class CacheManager {
  private cachedClips: Clip[] | null = null;
  private clipIndex: ClipIndex = new Map();
  private inflightLoad: Promise<Clip[]> | null = null;

  /**
   * 获取缓存的clips
   */
  async get(loader: () => Promise<Clip[]>): Promise<Clip[]> {
    if (this.cachedClips) {
      return this.clone(this.cachedClips);
    }

    if (!this.inflightLoad) {
      this.inflightLoad = loader()
        .then(clips => {
          this.update(clips);
          return this.cachedClips ?? [];
        })
        .finally(() => {
          this.inflightLoad = null;
        });
    }

    return this.inflightLoad;
  }

  /**
   * 根据URL查找clips
   */
  getByUrl(url: string): Clip[] {
    return this.clone(lookupClipsForUrl(this.clipIndex, url));
  }

  /**
   * 更新缓存
   */
  update(clips: Clip[]): void {
    const normalized = normalizeClips(clips);
    this.cachedClips = this.clone(normalized);
    this.clipIndex = buildClipIndex(this.cachedClips);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cachedClips = null;
    this.clipIndex.clear();
    this.inflightLoad = null;
  }

  /**
   * 检查缓存是否存在
   */
  has(): boolean {
    return this.cachedClips !== null;
  }

  /**
   * 克隆clips数组
   */
  private clone(clips: Clip[]): Clip[] {
    return clips.map(clip => ({ ...clip }));
  }
}

// 导出单例实例
export const cacheManager = new CacheManager();
