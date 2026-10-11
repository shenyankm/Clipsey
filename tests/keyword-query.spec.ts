import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 1057 }, (_, i) => ({
  id: String(i).padStart(4, '0'),
  title: i % 3 ? 'NEEDLE title' : undefined,
  textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${i % 5}`,
  htmlContent: '<b>rich content</b>',
  sourceUrl: i % 11 ? `https://example.com/${['Z', 'a', 'ä', '😀'][i % 4]}` : undefined,
  createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 7) * 1000).toISOString()
}));

beforeEach(async () => {
  vi.restoreAllMocks();
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', clips);
});
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

it.each(['createdAt', 'sourceUrl', 'textContent'] as const)(
  'matches native %s index ordering in both directions across batches and ties', async indexName => {
    for (const direction of ['next', 'prev'] as const) {
      const ordered = await IndexedDBQuery.getAll('clips', { indexName, direction });
      const expected = ordered.filter(clip => clip.textContent.includes('Needle'));
      const batch = vi.spyOn(IDBObjectStore.prototype, 'getAll');
      const cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
      const result = await IndexedDBQuery.filterByKeywordPaged('clips', 'NEEDLE', ['textContent'], 12, 20, { indexName, direction });
      expect(result).toEqual({ items: expected.slice(220, 240), total: expected.length, page: 12, pageSize: 20 });
      expect(batch).toHaveBeenCalledTimes(direction === 'next' ? 5 : 0);
      expect(batch.mock.calls.every(([, count]) => count === 256)).toBe(true);
      expect(cursor).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  }
);

it('keeps exact totals for empty and out-of-range pages and matches optional fields', async () => {
  const options = { indexName: 'createdAt', direction: 'desc' as const };
  expect(await IndexedDBQuery.filterByKeywordPaged('clips', 'absent', ['title'], 1, 20, options))
    .toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  const result = await IndexedDBQuery.filterByKeywordPaged('clips', 'needle', ['title'], 100, 20, options);
  expect(result.items).toEqual([]);
  expect(result.total).toBe(clips.filter(clip => clip.title).length);
  const unicode = await IndexedDBQuery.filterByKeywordPaged('clips', '测试', ['title', 'textContent'], 1, 1, options);
  expect(unicode.items[0]?.id).toBe('1055');
  expect(unicode.total).toBe(528);
});

it('batches title sorting without filtering out missing titles', async () => {
  const batch = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const result = await IndexedDBQuery.filterByKeywordPaged('clips', '', ['title'], 1, 20, { orderBy: 'title', direction: 'asc' });
  expect(result.total).toBe(clips.length);
  expect(result.items).toEqual(clips.filter(clip => !clip.title).slice(0, 20));
  expect(batch.mock.calls.every(([, count]) => count === 256)).toBe(true);
  const matched = await IndexedDBQuery.filterByKeywordPaged('clips', 'needle', ['title'], 2, 20, { orderBy: 'title', direction: 'desc' });
  const expected = clips.filter(clip => clip.title).reverse();
  expect(matched.total).toBe(expected.length);
  expect(matched.items).toEqual(expected.slice(20, 40));
});

it('keeps stable native primary-key order for locale-equivalent titles and IDs', async () => {
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', [
    { ...clips[0]!, id: 'é', title: 'Same' },
    { ...clips[0]!, id: 'e\u0301', title: 'Same' }
  ]);
  for (const direction of ['asc', 'desc'] as const) {
    const result = await IndexedDBQuery.filterByKeywordPaged('clips', '', ['title'], 1, 20, { orderBy: 'title', direction });
    expect(result.items.map(clip => clip.id)).toEqual(['e\u0301', 'é']);
  }
});

it('preserves bounded ranges, unique cursors, and fractional page sizes on the cursor path', async () => {
  const unique = await IndexedDBQuery.getAll('clips', { indexName: 'sourceUrl', direction: 'nextunique' });
  const matched = unique.filter(clip => clip.title?.toLowerCase().includes('needle'));
  const result = await IndexedDBQuery.filterByKeywordPaged('clips', 'needle', ['title'], 1, 2, {
    indexName: 'sourceUrl', direction: 'nextunique'
  });
  expect(result.items).toEqual(matched.slice(0, 2));
  expect(result.total).toBe(matched.length);
  const range = IDBKeyRange.bound(clips[100]!.createdAt, clips[150]!.createdAt);
  const expected = (await IndexedDBQuery.getAll('clips', { indexName: 'createdAt', query: range }))
    .filter(clip => clip.textContent.includes('Needle'));
  const bounded = await IndexedDBQuery.filterByKeywordPaged('clips', 'needle', ['textContent'], 1, 1.5, {
    indexName: 'createdAt', query: range
  });
  expect(bounded.items).toEqual(expected.slice(0, 2));
  expect(bounded.total).toBe(expected.length);
});

it.each(['getAll', 'get'] as const)('propagates async %s failures without returning partial results', async method => {
  vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(() => {
    const request = { error: new Error('Read failed'), onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(IndexedDBQuery.filterByKeywordPaged('clips', 'needle', ['textContent'], 1, 20, { indexName: 'createdAt' }))
    .rejects.toThrow('Failed to query with keyword');
});

it('reads one transaction snapshot and sees a queued write on the next query', async () => {
  const readBatch = IDBObjectStore.prototype.getAll;
  let writing: Promise<string> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(function(this: IDBObjectStore, ...args) {
    const request = readBatch.apply(this, args);
    writing = indexedDBManager.put('clips', { ...clips[0]!, textContent: 'needle changed' });
    return request;
  });
  const before = await IndexedDBQuery.filterByKeywordPaged('clips', 'changed', ['textContent'], 1, 20, { indexName: 'createdAt' });
  expect(before.total).toBe(0);
  await writing;
  const after = await IndexedDBQuery.filterByKeywordPaged('clips', 'changed', ['textContent'], 1, 20, { indexName: 'createdAt' });
  expect(after.total).toBe(1);
  expect(after.items[0]?.id).toBe('0000');
});
