import { describe, expect, it, vi } from 'vitest';
import { CacheManager } from '@/background/storage/cache-manager';
import type { Clip } from '@/types/clip';

const clip = (id: string): Clip => ({
  id, textContent: id, sourceUrl: 'https://example.com', createdAt: '2025-01-01T00:00:00.000Z'
});

describe('clip cache invalidation', () => {
  it('does not restore an invalidated snapshot when an old load completes', async () => {
    const cache = new CacheManager();
    let finish!: (clips: Clip[]) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<Clip[]>(resolve => { finish = resolve; }))
      .mockResolvedValue([clip('new')]);
    const pending = cache.get(loader);
    cache.clear();
    finish([clip('old')]);
    expect((await pending).map(item => item.id)).toEqual(['new']);
    expect((await cache.get(loader)).map(item => item.id)).toEqual(['new']);
  });

  it('returns independent objects even on the first load', async () => {
    const cache = new CacheManager();
    const loader = vi.fn().mockResolvedValue([clip('saved')]);
    const result = await cache.get(loader);
    result[0].textContent = 'changed by caller';
    expect((await cache.get(loader))[0].textContent).toBe('saved');
  });
});
