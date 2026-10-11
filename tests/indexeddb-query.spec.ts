import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 60 }, (_, i) => ({
  id: String(i).padStart(3, '0'), textContent: `Text ${i}`,
  sourceUrl: `https://example.com/${Math.floor(i / 10)}`,
  createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString()
}));

beforeEach(async () => {
  vi.restoreAllMocks();
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', clips);
});
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

describe('IndexedDB offset queries', () => {
  it.each(['next', 'prev'] as const)('returns the correct deep page in %s order with one advance', async direction => {
    const advance = vi.spyOn(IDBCursor.prototype, 'advance');
    const next = vi.spyOn(IDBCursor.prototype, 'continue');
    const { data, total } = await IndexedDBQuery.paginate('clips', 5, 10, { indexName: 'createdAt_id', direction });
    const ordered = direction === 'next' ? clips : [...clips].reverse();
    expect(data).toEqual(ordered.slice(40, 50));
    expect(total).toBe(60);
    expect(advance).toHaveBeenCalledExactlyOnceWith(40);
    expect(next).toHaveBeenCalledTimes(10);
  });

  it('handles the first page, unbounded reads, and offsets at or beyond the end', async () => {
    expect(await IndexedDBQuery.getAll('clips', { limit: 10 })).toEqual(clips.slice(0, 10));
    expect(await IndexedDBQuery.getAll('clips')).toEqual(clips);
    expect(await IndexedDBQuery.getAll('clips', { offset: 40 })).toEqual(clips.slice(40));
    expect(await IndexedDBQuery.getAll('clips', { offset: 60, limit: 10 })).toEqual([]);
    expect(await IndexedDBQuery.getAll('clips', { offset: 100, limit: 10 })).toEqual([]);
  });

  it('applies offsets within a key range and retains unique cursor semantics', async () => {
    expect(await IndexedDBQuery.getAll('clips', {
      query: IDBKeyRange.bound('010', '029'), offset: 5, limit: 4
    })).toEqual(clips.slice(15, 19));
    const unique = await IndexedDBQuery.getAll('clips', { indexName: 'sourceUrl', direction: 'nextunique' });
    expect(await IndexedDBQuery.getAll('clips', {
      indexName: 'sourceUrl', direction: 'nextunique', offset: 2, limit: 2
    })).toEqual(unique.slice(2, 4));
  });

  it('keeps legacy fractional offsets and zero limits working', async () => {
    expect(await IndexedDBQuery.getAll('clips', { offset: 1.5, limit: 2 })).toEqual(clips.slice(2, 4));
    expect(await IndexedDBQuery.getAll('clips', { limit: 0 })).toEqual(clips);
  });

  it('propagates cursor errors instead of returning partial results', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(() => {
      throw new DOMException('Invalid cursor', 'InvalidStateError');
    });
    await expect(IndexedDBQuery.getAll('clips')).rejects.toThrow('Invalid cursor');
  });
});
