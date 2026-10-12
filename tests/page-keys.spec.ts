import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import { CLIP_REVISION_KEY } from '@/types/indexeddb';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 600 }, (_, i) => ({
  id: String(i).padStart(5, '0'), textContent: `Text ${i % 5}`, htmlContent: `<b>${i}</b>`,
  sourceUrl: `https://example.com/${i % 10}`, createdAt: new Date(1700000000000 + Math.floor(i / 5) * 1000).toISOString()
}));
beforeEach(async () => { vi.restoreAllMocks(); await indexedDBManager.clear('clips'); await IndexedDBQuery.bulkPut('clips', clips); });
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

it.each([undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id'].flatMap(indexName => (['next', 'prev'] as const).map(direction => ({ indexName, direction }))))('reuses $indexName / $direction page keys and hydrates complete independent rows', async options => {
  const first = await IndexedDBQuery.paginate('clips', 16, 20, options);
  const original = structuredClone(first);
  first.data[0]!.id = 'mutated'; first.data[0]!.htmlContent = 'mutated';
  const cursor = vi.spyOn(options.indexName ? IDBIndex.prototype : IDBObjectStore.prototype, 'openKeyCursor');
  const get = vi.spyOn(IDBObjectStore.prototype, 'get');
  expect(await IndexedDBQuery.paginate('clips', 16, 20, options)).toEqual(original);
  expect(cursor).not.toHaveBeenCalled();
  expect(get.mock.contexts.filter(store => store.name === 'clips')).toHaveLength(20);
});

it('invalidates keys after a write changes index ordering without changing total', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  await indexedDBManager.put('clips', { ...clips[300]!, createdAt: '2099-01-01T00:00:00Z', htmlContent: '<b>fresh</b>' });
  const expected = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt' });
  const cursor = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
  expect((await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' })).data).toEqual(expected.slice(300, 320));
  expect(cursor).toHaveBeenCalledOnce();
});

it('verifies cached keys in the current snapshot and sees a queued deletion next time', async () => {
  const expected = await IndexedDBQuery.paginate('clips', 16, 20);
  const get = IDBObjectStore.prototype.get; let writing: Promise<void> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    const request = get.call(this, key);
    if (this.name === 'metadata' && key === CLIP_REVISION_KEY && !writing) writing = indexedDBManager.delete('clips', clips[300]!.id);
    return request;
  });
  expect(await IndexedDBQuery.paginate('clips', 16, 20)).toEqual(expected);
  await writing;
  const next = await IndexedDBQuery.paginate('clips', 16, 20);
  expect(next.total).toBe(599); expect(next.data).toEqual(clips.slice(301, 321));
});

it('does not reuse markerless or replacement-connection page keys', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20);
  await indexedDBManager.clear('metadata');
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  await IndexedDBQuery.paginate('clips', 16, 20); await IndexedDBQuery.paginate('clips', 16, 20);
  expect(cursor).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks(); await indexedDBManager.put('clips', clips[0]!); await IndexedDBQuery.paginate('clips', 16, 20);
  indexedDBManager.close();
  const reopened = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  await IndexedDBQuery.paginate('clips', 16, 20); expect(reopened).toHaveBeenCalledOnce();
});

it('evicts the oldest of more than sixteen pages', async () => {
  for (let page = 301; page <= 317; page++) await IndexedDBQuery.paginate('clips', page, 1);
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  await IndexedDBQuery.paginate('clips', 317, 1); expect(cursor).not.toHaveBeenCalled();
  await IndexedDBQuery.paginate('clips', 301, 1); expect(cursor).toHaveBeenCalledOnce();
});

it('does not cache keys above the field-weight bound', async () => {
  const large = { ...clips[0]!, id: 'x'.repeat(128 * 1024) };
  await indexedDBManager.put('clips', large);
  await IndexedDBQuery.paginate('clips', 31, 20);
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  expect((await IndexedDBQuery.paginate('clips', 31, 20)).data).toEqual([large]); expect(cursor).toHaveBeenCalledOnce();
});

it('keeps numeric legacy primary keys on the native cursor path', async () => {
  await indexedDBManager.put('clips', { ...clips[300]!, id: 300 } as unknown as Clip);
  const expected = await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  const cursor = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
  expect(await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' })).toEqual(expected); expect(cursor).toHaveBeenCalledOnce();
});

it('keeps ranges, unique directions and large pages on their native paths', async () => {
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt' });
  const keys = vi.spyOn(IDBIndex.prototype, 'openKeyCursor'), values = vi.spyOn(IDBIndex.prototype, 'openCursor');
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt', query: IDBKeyRange.lowerBound(clips[0]!.createdAt) });
  expect(keys).toHaveBeenCalledOnce();
  await IndexedDBQuery.paginate('clips', 16, 20, { indexName: 'createdAt', direction: 'nextunique' });
  await IndexedDBQuery.paginate('clips', 4, 101, { indexName: 'createdAt' });
  expect(values).toHaveBeenCalledTimes(2);
});

it('distinguishes page sizes and normalizes direction aliases', async () => {
  const expected = await IndexedDBQuery.paginate('clips', 16, 20, { direction: 'asc' });
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  expect(await IndexedDBQuery.paginate('clips', 16, 20, { direction: 'next' })).toEqual(expected);
  expect(cursor).not.toHaveBeenCalled();
  expect((await IndexedDBQuery.paginate('clips', 31, 10)).data).toEqual(clips.slice(300, 310));
  expect(cursor).toHaveBeenCalledOnce();
});

it('fails a cached page if hydration fails and keeps a fresh retry possible', async () => {
  const expected = await IndexedDBQuery.paginate('clips', 16, 20);
  const get = IDBObjectStore.prototype.get;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    if (this.name === 'clips') throw new Error('Hydration failed');
    return get.call(this, key);
  });
  await expect(IndexedDBQuery.paginate('clips', 16, 20)).rejects.toThrow('Hydration failed');
  vi.restoreAllMocks(); expect(await IndexedDBQuery.paginate('clips', 16, 20)).toEqual(expected);
});
