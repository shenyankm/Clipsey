// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import { CLIP_REVISION_KEY } from '@/types/indexeddb';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 600 }, (_, i) => ({ id: String(i).padStart(5, '0'), textContent: `Text ${i % 5}`, htmlContent: `<b>${i}</b>`,
  sourceUrl: `https://example.com/${i % 10}`, createdAt: new Date(1700000000000 + Math.floor(i / 5) * 1000).toISOString() }));
beforeEach(async () => { vi.restoreAllMocks(); await indexedDBManager.clear('clips'); await IndexedDBQuery.bulkPut('clips', clips); });
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

it.each([undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id'].flatMap(indexName => (['next', 'prev'] as const).flatMap(direction => [17, 15, 20].map(page => ({ indexName, direction, page })))))('seeks $indexName / $direction new page $page from the closest page boundary', async ({ page, ...options }) => {
  const expected = await IndexedDBQuery.getAll('clips', options);
  await IndexedDBQuery.paginate('clips', 16, 20, options);
  const advance = vi.spyOn(IDBCursor.prototype, 'advance'), get = vi.spyOn(IDBObjectStore.prototype, 'get');
  const cursor = vi.spyOn(options.indexName ? IDBIndex.prototype : IDBObjectStore.prototype, 'openKeyCursor');
  const result = await IndexedDBQuery.paginate('clips', page, 20, options);
  expect(result.data).toEqual(expected.slice((page - 1) * 20, page * 20)); expect(result.total).toBe(600);
  const fallback = page === 15 && ['sourceUrl', 'textContent'].includes(options.indexName ?? '');
  expect(advance).toHaveBeenCalledOnce(); expect(advance).toHaveBeenCalledWith(fallback ? 280 : page === 20 ? 61 : 1);
  if (fallback) expect(cursor.mock.calls[0]![0]).toBeUndefined(); else expect(cursor.mock.calls[0]![0]).toBeInstanceOf(IDBKeyRange);
  expect(cursor.mock.calls[0]![1]).toBe(page === 15 && !fallback ? options.direction === 'next' ? 'prev' : 'next' : options.direction);
  expect(get.mock.contexts.filter(store => store.name === 'clips')).toHaveLength(20);
});

it.each(['next', 'prev'] as const)('avoids reversing from the far end of an unbounded duplicate group / %s', async direction => {
  const rows = clips.map(clip => ({ ...clip, createdAt: clips[0]!.createdAt }));
  // Keep one existing ID to test updates without quadratic fixture overwrites.
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', [clips[clips.length - 1]!]);
  await IndexedDBQuery.bulkPut('clips', rows);
  const options = { indexName: 'createdAt', direction }, expected = direction === 'next' ? rows : [...rows].reverse();
  await IndexedDBQuery.paginate('clips', 16, 20, options);
  const advance = vi.spyOn(IDBCursor.prototype, 'advance'), seek = vi.spyOn(IDBCursor.prototype, 'continuePrimaryKey');
  expect((await IndexedDBQuery.paginate('clips', 15, 20, options)).data).toEqual(expected.slice(280, 300));
  expect(advance).toHaveBeenCalledWith(280); expect(seek).not.toHaveBeenCalled();
});

it.each(['next', 'prev'] as const)('uses a later distinct key to bound an early reverse seek / %s', async direction => {
  const options = { indexName: 'textContent', direction }, expected = await IndexedDBQuery.getAll('clips', options);
  await IndexedDBQuery.paginate('clips', 20, 20, options); await IndexedDBQuery.paginate('clips', 16, 20, options);
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  expect((await IndexedDBQuery.paginate('clips', 15, 20, options)).data).toEqual(expected.slice(280, 300));
  expect(advance).toHaveBeenCalledWith(1);
});

it('reuses boundaries across page sizes and preserves a partial last page', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20);
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  expect((await IndexedDBQuery.paginate('clips', 32, 10)).data).toEqual(clips.slice(310, 320)); expect(advance).not.toHaveBeenCalled();
  vi.restoreAllMocks(); await IndexedDBQuery.bulkPut('clips', Array.from({ length: 5 }, (_, i) => ({ ...clips[0]!, id: `extra${i}` })));
  await IndexedDBQuery.paginate('clips', 30, 20);
  const partial = await IndexedDBQuery.paginate('clips', 31, 20);
  expect(partial.total).toBe(605); expect(partial.data.map(row => row.id)).toEqual(['extra0','extra1','extra2','extra3','extra4']);
  indexedDBManager.close(); await IndexedDBQuery.paginate('clips', 31, 20);
  expect((await IndexedDBQuery.paginate('clips', 30, 20)).data).toEqual(clips.slice(580));
});

it('rejects stale anchors after an index write and after removing the version marker', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  await indexedDBManager.put('clips', { ...clips[310]!, createdAt: '2099-01-01T00:00:00Z' });
  const expected = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt' });
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  expect((await IndexedDBQuery.paginate('clips', 17, 20, { indexName: 'createdAt' })).data).toEqual(expected.slice(320, 340));
  expect(advance).toHaveBeenCalledWith(260);
  await indexedDBManager.clear('metadata'); advance.mockClear();
  expect((await IndexedDBQuery.paginate('clips', 18, 20, { indexName: 'createdAt' })).data).toEqual(expected.slice(340, 360));
  expect(advance).toHaveBeenCalledWith(240);
});

it('does not use anchors from another index, direction or a bounded range', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  await IndexedDBQuery.paginate('clips', 17, 20, { indexName: 'sourceUrl' });
  await IndexedDBQuery.paginate('clips', 17, 20, { indexName: 'createdAt', direction: 'prev' });
  await IndexedDBQuery.paginate('clips', 17, 20, { indexName: 'createdAt', query: IDBKeyRange.lowerBound(clips[0]!.createdAt) });
  expect(advance.mock.calls.map(args => args[0])).toEqual([260,260,260]);
});

it('propagates a primary-key seek failure and allows a fresh retry', async () => {
  const options = { indexName: 'sourceUrl' };
  const expected = await IndexedDBQuery.getAll('clips', options);
  await IndexedDBQuery.paginate('clips', 16, 20, options);
  vi.spyOn(IDBCursor.prototype, 'continuePrimaryKey').mockImplementation(() => { throw new Error('Seek failed'); });
  await expect(IndexedDBQuery.paginate('clips', 17, 20, options)).rejects.toThrow('Seek failed');
  vi.restoreAllMocks(); expect((await IndexedDBQuery.paginate('clips', 17, 20, options)).data).toEqual(expected.slice(320, 340));
});

it('drops oversized index boundaries while retaining the primary-key page cache', async () => {
  const large = { ...clips[0]!, id: 'large', textContent: 'z'.repeat(128 * 1024) };
  await indexedDBManager.put('clips', large); await IndexedDBQuery.paginate('clips', 31, 20, { indexName: 'textContent' });
  const cursor = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
  expect((await IndexedDBQuery.paginate('clips', 31, 20, { indexName: 'textContent' })).data).toEqual([large]); expect(cursor).not.toHaveBeenCalled();
});

it('uses the nearer end without caching numeric index boundaries', async () => {
  const rows = clips.map((clip, i) => ({ ...clip, createdAt: i })) as unknown as Clip[];
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', [clips[clips.length - 1]!]);
  await IndexedDBQuery.bulkPut('clips', rows); await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  expect((await IndexedDBQuery.paginate('clips', 17, 20, { indexName: 'createdAt' })).data).toEqual(rows.slice(320, 340));
  expect(advance).toHaveBeenCalledWith(260);
});

it('keeps array index boundaries independent of mutated returned fields', async () => {
  const rows = clips.map((clip, i) => ({ ...clip, createdAt: [String(Math.floor(i / 5))] })) as unknown as Clip[];
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', [clips[clips.length - 1]!]);
  await IndexedDBQuery.bulkPut('clips', rows);
  const options = { indexName: 'createdAt' }, expected = await IndexedDBQuery.getAll('clips', options);
  const seed = await IndexedDBQuery.paginate('clips', 16, 20, options);
  (seed.data[0]!.createdAt as unknown as string[])[0] = 'mutated';
  const advance = vi.spyOn(IDBCursor.prototype, 'advance');
  expect((await IndexedDBQuery.paginate('clips', 17, 20, options)).data).toEqual(expected.slice(320, 340));
  expect(advance).toHaveBeenCalledWith(1);
});

it('seeks within the current snapshot and invalidates boundaries after a queued delete', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20);
  const get = IDBObjectStore.prototype.get; let writing: Promise<void> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    const request = get.call(this, key);
    if (this.name === 'metadata' && key === CLIP_REVISION_KEY && !writing) writing = indexedDBManager.delete('clips', clips[310]!.id);
    return request;
  });
  const first = await IndexedDBQuery.paginate('clips', 17, 20);
  expect(first.total).toBe(600); expect(first.data).toEqual(clips.slice(320, 340));
  await writing;
  const next = await IndexedDBQuery.paginate('clips', 17, 20);
  expect(next.total).toBe(599); expect(next.data).toEqual(clips.slice(321, 341));
});
