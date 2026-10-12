import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';
import type { QueryOptions } from '@/types/indexeddb';

const clips: Clip[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i).padStart(4, '0'), textContent: `Text ${i % 4}`, htmlContent: `<b>${i}</b>`,
  sourceUrl: 'https://example.com', createdAt: '2025-01-01T00:00:00Z'
}));
beforeEach(async () => { vi.restoreAllMocks(); await indexedDBManager.clear('clips'); await IndexedDBQuery.bulkPut('clips', clips); });
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

it.each([{}, { indexName: 'createdAt' }, { indexName: 'textContent' }, { indexName: 'createdAt_id' }])('uses exact total without opening a cursor for warm $indexName beyond the last page', async options => {
  await IndexedDBQuery.count('clips', options.indexName);
  const store = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
  const index = vi.spyOn(IDBIndex.prototype, 'openCursor');
  const keys = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
  for (const page of [3, 501]) {
    expect(await IndexedDBQuery.paginate('clips', page, 20, { ...options, direction: 'prev' })).toEqual({ data: [], total: 40, page, pageSize: 20, totalPages: 2 });
  }
  expect(store).not.toHaveBeenCalled(); expect(index).not.toHaveBeenCalled(); expect(keys).not.toHaveBeenCalled();
});

it.each(['next', 'prev', 'asc', 'desc', 'nextunique', 'prevunique', undefined] as const)('skips the empty cursor with a valid %s direction', async direction => {
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.count('clips');
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
  expect((await IndexedDBQuery.paginate('clips', 1, 20, { direction })).data).toEqual([]);
  expect(cursor).not.toHaveBeenCalled();
});

it('retains invalid direction errors even for an empty store', async () => {
  await indexedDBManager.clear('clips');
  // fake-indexeddb 不校验 WebIDL 枚举；模拟浏览器的原生 TypeError。
  vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(() => { throw new TypeError('Invalid cursor direction'); });
  await expect(IndexedDBQuery.paginate('clips', 1, 20, { direction: 'invalid' } as unknown as QueryOptions)).rejects.toThrow();
});

it.each([
  { page: 0, size: 20 }, { page: 1, size: 0 }, { page: 1, size: -1 },
  { page: 3.01, size: 20 }, { page: 3, size: 20.5 }, { page: NaN, size: 20 }
])('preserves existing special parameters $page / $size', async ({ page, size }) => {
  const expected = await IndexedDBQuery.getAll('clips', { offset: (page - 1) * size, limit: size });
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
  const all = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect((await IndexedDBQuery.paginate('clips', page, size)).data).toEqual(expected);
  if (size === 0) { expect(cursor).not.toHaveBeenCalled(); expect(all).toHaveBeenCalledOnce(); }
  else expect(cursor).toHaveBeenCalledOnce();
});

it('uses the counted snapshot while a new clip is queued after an empty result', async () => {
  await indexedDBManager.clear('clips');
  const count = IDBObjectStore.prototype.count;
  let writing: Promise<string> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'count').mockImplementation(function(this: IDBObjectStore, query) {
    const request = count.call(this, query);
    if (this.name === 'clips' && !writing) writing = indexedDBManager.put('clips', clips[0]!);
    return request;
  });
  expect((await IndexedDBQuery.paginate('clips', 1, 20)).total).toBe(0);
  await writing;
  const next = await IndexedDBQuery.paginate('clips', 1, 20);
  expect(next.total).toBe(1); expect(next.data).toEqual([clips[0]]);
});

it('keeps native cursor reads for a cold count and a bounded range', async () => {
  const cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
  expect((await IndexedDBQuery.paginate('clips', 3, 20, { indexName: 'sourceUrl' })).data).toEqual([]);
  expect((await IndexedDBQuery.paginate('clips', 3, 20, { indexName: 'sourceUrl', query: IDBKeyRange.only('https://example.com') })).data).toEqual([]);
  expect(cursor).toHaveBeenCalledTimes(2);
});

it('does not trust a stale empty hint after an insertion', async () => {
  await IndexedDBQuery.count('clips');
  const added = { ...clips[0]!, id: 'new' };
  await indexedDBManager.put('clips', added);
  const result = await IndexedDBQuery.paginate('clips', 3, 20);
  expect(result.total).toBe(41); expect(result.data).toEqual([added]);
});
