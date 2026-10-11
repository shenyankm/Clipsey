import { describe, expect, it, vi } from 'vitest';
import { CacheManager } from '@/background/storage/cache-manager';
import type { Clip } from '@/types/clip';
import { CLIP_URL_KEY } from '@/types/indexeddb';

const clip = (id: string): Clip => ({
  id, textContent: id, sourceUrl: 'https://example.com', createdAt: '2025-01-01T00:00:00.000Z'
});

describe('clip cache invalidation', () => {
  it.each(['whole', 'page'])('keeps private snapshot fields out of %s results without changing frozen inputs', async path => {
    const cache = new CacheManager();
    const key = Object.freeze(['https://example.com/', clip('stored').createdAt, 'stored']);
    const stored = Object.freeze({ ...clip('stored'), updatedAt: '2025-01-02', [CLIP_URL_KEY]: key });
    const load = path === 'whole'
      ? () => cache.get(async () => [stored])
      : () => cache.getByUrl(stored.sourceUrl, async () => { throw new Error('Unexpected full load'); }, async () => [stored]);
    const rows = await load();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(clip('stored'));
    expect(Object.hasOwn(rows[0], CLIP_URL_KEY)).toBe(false);
    rows[0].textContent = 'caller';
    expect((await load())[0].textContent).toBe('stored');
    expect(stored[CLIP_URL_KEY]).toBe(key);
  });

  it('shares same-base page loads, isolates results, and never exposes the page as all clips', async () => {
    const cache = new CacheManager();
    const input = [{ ...clip('page'), sourceUrl: 'https://example.com/?q=a' }];
    const page = vi.fn().mockResolvedValue(input);
    const all = vi.fn().mockResolvedValue([...input, { ...clip('other'), sourceUrl: 'https://other.com' }]);
    const [a, b] = await Promise.all(['a', 'b'].map(q => cache.getByUrl(`https://example.com/?q=${q}`, all, page)));
    expect(page).toHaveBeenCalledTimes(1);
    expect(all).not.toHaveBeenCalled();
    expect(cache.has()).toBe(false);
    a[0].textContent = 'caller';
    input[0].textContent = 'input';
    expect(b[0].textContent).toBe('page');
    expect((await cache.getByUrl('https://example.com', all, page))[0].textContent).toBe('page');
    expect(await cache.get(all)).toHaveLength(2);
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('does not let an older base replace the latest page and keeps only one base cached', async () => {
    const cache = new CacheManager();
    let finish!: (clips: Clip[]) => void;
    const all = vi.fn();
    const page = vi.fn().mockImplementationOnce(() => new Promise<Clip[]>(resolve => { finish = resolve; }))
      .mockResolvedValue([{ ...clip('other'), sourceUrl: 'https://other.com' }]);
    const pending = cache.getByUrl('https://example.com', all, page);
    expect(await cache.getByUrl('https://other.com', all, page)).toHaveLength(1);
    finish([clip('old')]);
    expect((await pending)[0].id).toBe('old');
    await cache.getByUrl('https://other.com', all, page);
    expect(page).toHaveBeenCalledTimes(2);
    page.mockResolvedValue([clip('new')]);
    expect((await cache.getByUrl('https://example.com', all, page))[0].id).toBe('new');
    await cache.getByUrl('https://other.com', all, page);
    expect(page).toHaveBeenCalledTimes(4);
  });

  it('retries invalidated page loads and leaves failed loads retryable', async () => {
    const cache = new CacheManager();
    let finish!: (clips: Clip[]) => void;
    const page = vi.fn().mockImplementationOnce(() => new Promise<Clip[]>(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue([clip('new')]);
    const all = vi.fn();
    const pending = cache.getByUrl('https://example.com', all, page);
    cache.clear();
    finish([clip('old')]);
    await expect(pending).rejects.toThrow('Read failed');
    expect((await cache.getByUrl('https://example.com', all, page))[0].id).toBe('new');
    expect(all).not.toHaveBeenCalled();
  });

  it('uses a concurrent full snapshot instead of restoring an obsolete page', async () => {
    const cache = new CacheManager();
    let finish!: (clips: Clip[]) => void;
    const page = vi.fn(() => new Promise<Clip[]>(resolve => { finish = resolve; }));
    const all = vi.fn().mockResolvedValue([clip('new')]);
    const pending = cache.getByUrl('https://example.com', all, page);
    await cache.get(all);
    finish([clip('old')]);
    expect((await pending)[0].id).toBe('new');
    expect(page).toHaveBeenCalledTimes(1);
  });

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

  it('loads once for concurrent full and URL reads and isolates their results', async () => {
    const cache = new CacheManager();
    const loader = vi.fn().mockResolvedValue([clip('saved')]);
    const [all, first, second] = await Promise.all([
      cache.get(loader), cache.getByUrl('https://example.com', loader), cache.getByUrl('https://example.com', loader)
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.map(item => item.id)).toEqual(['saved']);
    first[0].textContent = 'changed';
    expect(all[0].textContent).toBe('saved');
    expect(second[0].textContent).toBe('saved');
    expect(await cache.getByUrl('https://other.com', loader)).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retries URL reads after invalidation and propagates load failures', async () => {
    const cache = new CacheManager();
    let finish!: (clips: Clip[]) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<Clip[]>(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('Read failed'))
      .mockResolvedValue([clip('new')]);
    const pending = cache.getByUrl('https://example.com', loader);
    cache.clear();
    finish([clip('old')]);
    await expect(pending).rejects.toThrow('Read failed');
    expect(cache.has()).toBe(false);
    expect((await cache.getByUrl('https://example.com', loader)).map(item => item.id)).toEqual(['new']);
  });

  it('returns independent objects even on the first load', async () => {
    const cache = new CacheManager();
    const loader = vi.fn().mockResolvedValue([clip('saved')]);
    const result = await cache.get(loader);
    result[0].textContent = 'changed by caller';
    expect((await cache.get(loader))[0].textContent).toBe('saved');
  });

  it('isolates input records and keeps normalization at the cache boundary', async () => {
    const cache = new CacheManager();
    const input = [{ ...clip('saved'), highlightId: 'highlight' }, clip('saved'), { ...clip('empty'), textContent: '' }];
    cache.update(input);
    input[0].textContent = 'changed externally';
    input[0].sourceUrl = 'https://other.com';
    input.length = 0;
    const loader = vi.fn();
    expect(await cache.get(loader)).toEqual([expect.objectContaining({
      id: 'saved', textContent: 'saved', highlightId: 'highlight', highlightStyle: 'inline'
    })]);
    expect((await cache.getByUrl('https://example.com', loader)).map(item => item.id)).toEqual(['saved']);
    expect(await cache.getByUrl('https://other.com', loader)).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });
});
