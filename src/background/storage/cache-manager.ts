import type { Clip } from '@/types/clip';
import { normalizeClips } from '../storage/utils/clip-normalizer';
import { buildClipIndex, lookupClipsForUrl, type ClipIndex } from '../storage/clip-index';

/** 剪辑缓存管理器：负责内存缓存读取、更新与索引维护。 */
export class CacheManager {
  private cachedClips: Clip[] | null = null;
  private clipIndex: ClipIndex = new Map();
  private inflightLoad: Promise<Clip[]> | null = null;
  private revision = 0;

  // 获取缓存的剪辑（必要时触发加载并建立索引）
  async get(loader: () => Promise<Clip[]>): Promise<Clip[]> {
    return this.clone(await this.load(loader));
  }

  private async load(loader: () => Promise<Clip[]>): Promise<Clip[]> {
    if (this.cachedClips) {
      return this.cachedClips;
    }

    if (!this.inflightLoad) {
      const revision = this.revision;
      const request = loader()
        .then(clips => {
          if (revision !== this.revision) return this.load(loader);
          this.update(clips);
          return this.cachedClips!;
        })
        .finally(() => {
          if (this.inflightLoad === request) this.inflightLoad = null;
        });
      this.inflightLoad = request;
    }

    return this.inflightLoad;
  }

  // 只克隆 URL 命中的记录，避免为确保加载而复制整个缓存。
  async getByUrl(url: string, loader: () => Promise<Clip[]>): Promise<Clip[]> {
    await this.load(loader);
    return this.clone(lookupClipsForUrl(this.clipIndex, url));
  }

  // 更新缓存并重建索引
  update(clips: Clip[]): void {
    this.revision += 1;
    this.inflightLoad = null;
    const normalized = normalizeClips(clips);
    this.cachedClips = this.clone(normalized);
    this.clipIndex = buildClipIndex(this.cachedClips);
  }

  // 清空缓存
  clear(): void {
    this.revision += 1;
    this.cachedClips = null;
    this.clipIndex.clear();
    this.inflightLoad = null;
  }

  // 检查缓存是否存在
  has(): boolean {
    return this.cachedClips !== null;
  }

  // 克隆剪辑数组
  private clone(clips: Clip[]): Clip[] {
    return clips.map(clip => ({ ...clip }));
  }
}

// 导出单例实例
export const cacheManager = new CacheManager();
