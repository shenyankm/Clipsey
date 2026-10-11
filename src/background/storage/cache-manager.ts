import type { Clip } from '@/types/clip';
import { normalizeClips } from '../storage/utils/clip-normalizer';
import { buildClipIndex, lookupClipsForUrl, type ClipIndex } from '../storage/clip-index';
import { createIndexKeys } from './utils/url-normalizer';

/** 剪辑缓存管理器：负责内存缓存读取、更新与索引维护。 */
export class CacheManager {
  private cachedClips: Clip[] | null = null;
  private clipIndex: ClipIndex = new Map();
  private inflightLoad: Promise<Clip[]> | null = null;
  private revision = 0;
  private pageIndex: { base: string; index: ClipIndex } | null = null;
  private inflightPage: { base: string; promise: Promise<ClipIndex> } | null = null;

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
  async getByUrl(
    url: string,
    loader: () => Promise<Clip[]>,
    pageLoader?: (base: string) => Promise<Clip[] | null>
  ): Promise<Clip[]> {
    const base = pageLoader ? createIndexKeys(url).at(-1) : undefined;
    if (base && pageLoader) {
      return this.clone(lookupClipsForUrl(await this.loadPage(base, loader, pageLoader), url));
    }
    await this.load(loader);
    return this.clone(lookupClipsForUrl(this.clipIndex, url));
  }

  private async loadPage(
    base: string,
    loader: () => Promise<Clip[]>,
    pageLoader: (base: string) => Promise<Clip[] | null>
  ): Promise<ClipIndex> {
    if (this.cachedClips || this.inflightLoad) {
      await this.load(loader);
      return this.clipIndex;
    }
    if (this.pageIndex?.base === base) return this.pageIndex.index;
    if (this.inflightPage?.base === base) return this.inflightPage.promise;
    const revision = this.revision;
    const request: Promise<ClipIndex> = pageLoader(base).then(async clips => {
      if (revision !== this.revision) return this.loadPage(base, loader, pageLoader);
      if (clips === null) {
        await this.load(loader);
        return this.clipIndex;
      }
      const index = buildClipIndex(normalizeClips(clips));
      if (this.inflightPage?.promise === request && !this.cachedClips) this.pageIndex = { base, index };
      return index;
    }).finally(() => {
      if (this.inflightPage?.promise === request) this.inflightPage = null;
    });
    this.inflightPage = { base, promise: request };
    return request;
  }

  // 更新缓存并重建索引
  update(clips: Clip[]): void {
    this.revision += 1;
    this.inflightLoad = null;
    this.pageIndex = null;
    this.inflightPage = null;
    this.cachedClips = normalizeClips(clips);
    this.clipIndex = buildClipIndex(this.cachedClips);
  }

  // 清空缓存
  clear(): void {
    this.revision += 1;
    this.cachedClips = null;
    this.clipIndex.clear();
    this.inflightLoad = null;
    this.pageIndex = null;
    this.inflightPage = null;
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
