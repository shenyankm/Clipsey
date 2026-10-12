import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import { CLIP_REVISION_KEY } from '@/types/indexeddb';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i).padStart(4, '0'), textContent: `Text ${i}`, htmlContent: `<b>${i}</b>`,
  sourceUrl: 'https://example.com', createdAt: '2025-01-01T00:00:00Z'
}));
beforeEach(async () => {
  vi.restoreAllMocks();
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', clips);
});
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

it('reads total and rows in one snapshot before a queued deletion', async () => {
  const count = IDBIndex.prototype.count;
  let writing: Promise<void> | undefined;
  vi.spyOn(IDBIndex.prototype, 'count').mockImplementation(function(this: IDBIndex, query) {
    const request = count.call(this, query);
    if (!writing) writing = indexedDBManager.delete('clips', clips[0]!.id);
    return request;
  });
  const result = await IndexedDBQuery.paginate('clips', 1, 20, { indexName: 'createdAt' });
  expect(result.total).toBe(40);
  expect(result.data).toEqual(clips.slice(0, 20));
  await writing;
  const next = await IndexedDBQuery.paginate('clips', 1, 20, { indexName: 'createdAt' });
  expect(next.total).toBe(39);
  expect(next.data).toEqual(clips.slice(1, 21));
});

it('reuses exact counts per index and store without mixing missing index fields', async () => {
  await indexedDBManager.put('clips', { ...clips[0]!, sourceUrl: undefined } as unknown as Clip);
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  const storeCount = vi.spyOn(IDBObjectStore.prototype, 'count');
  for (let i = 0; i < 2; i++) {
    expect(await IndexedDBQuery.count('clips', 'sourceUrl')).toBe(39);
    expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(40);
    expect(await IndexedDBQuery.count('clips')).toBe(40);
  }
  expect(count).toHaveBeenCalledTimes(2);
  expect(storeCount).toHaveBeenCalledOnce();
});

it('counts a bounded range each time even after warming its full index', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  for (let i = 0; i < 2; i++) expect(await IndexedDBQuery.count('clips', 'createdAt', IDBKeyRange.only(clips[0]!.createdAt))).toBe(40);
  expect(count).toHaveBeenCalledTimes(2);
});

it.each(['put', 'delete', 'clear'] as const)('invalidates after %s', async operation => {
  await IndexedDBQuery.count('clips', 'createdAt');
  if (operation === 'put') await indexedDBManager.put('clips', { ...clips[0]!, id: 'new' });
  else if (operation === 'delete') await indexedDBManager.delete('clips', clips[0]!.id);
  else await indexedDBManager.clear('clips');
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(operation === 'put' ? 41 : operation === 'delete' ? 39 : 0);
  expect(count).toHaveBeenCalledOnce();
});

it('validates a warm revision in the page snapshot and sees a queued write next time', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  const get = IDBObjectStore.prototype.get;
  let writing: Promise<void> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    const request = get.call(this, key);
    if (this.name === 'metadata' && key === CLIP_REVISION_KEY && !writing) writing = indexedDBManager.delete('clips', clips[0]!.id);
    return request;
  });
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  const result = await IndexedDBQuery.paginate('clips', 1, 20, { indexName: 'createdAt' });
  expect(result.total).toBe(40); expect(result.data).toEqual(clips.slice(0, 20));
  expect(writing).toBeDefined(); expect(count).not.toHaveBeenCalled();
  await writing;
  expect((await IndexedDBQuery.paginate('clips', 1, 20, { indexName: 'createdAt' })).total).toBe(39);
});

it('keeps a valid count after a failed clip write rolls back', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  await expect(indexedDBManager.put('clips', { ...clips[0]!, id: undefined } as unknown as Clip)).rejects.toThrow();
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(40);
  expect(count).not.toHaveBeenCalled();
});

it.each(['missing', 'invalid'] as const)('does not cache a %s revision marker', async mode => {
  await IndexedDBQuery.count('clips', 'createdAt');
  await indexedDBManager.clear('metadata');
  if (mode === 'invalid') await indexedDBManager.put('metadata', { key: CLIP_REVISION_KEY, value: 5, createdAt: '', updatedAt: '' });
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  for (let i = 0; i < 2; i++) expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(40);
  expect(count).toHaveBeenCalledTimes(2);
});

it('does not carry counts across database connection replacement', async () => {
  await IndexedDBQuery.count('clips', 'createdAt'); indexedDBManager.close();
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(40); expect(count).toHaveBeenCalledOnce();
});

it('retains native counting for other stores', async () => {
  const count = vi.spyOn(IDBObjectStore.prototype, 'count');
  await IndexedDBQuery.count('errorLogs'); await IndexedDBQuery.count('errorLogs');
  expect(count).toHaveBeenCalledTimes(2);
});

it('still rejects a nonexistent index after warming another count', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  await expect(IndexedDBQuery.count('clips', 'nonexistent')).rejects.toThrow();
});

it('does not publish a count when the page transaction aborts', async () => {
  const cursor = IDBObjectStore.prototype.openCursor;
  vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function(this: IDBObjectStore, query, direction) {
    const request = cursor.call(this, query, direction);
    request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  });
  await expect(IndexedDBQuery.paginate('clips', 1, 20)).rejects.toThrow();
  vi.restoreAllMocks();
  const count = vi.spyOn(IDBObjectStore.prototype, 'count');
  expect(await IndexedDBQuery.count('clips')).toBe(40); expect(count).toHaveBeenCalledOnce();
});

it('falls back to native counts when a quota error removes the revision', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  const put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key?) {
    if (this.name !== 'metadata') return put.call(this, value, key);
    const request = add.call(this, value, key);
    Object.defineProperty(request, 'error', { get: () => new DOMException('Quota full', 'QuotaExceededError'), set() {} });
    return request;
  });
  await indexedDBManager.delete('clips', clips[0]!.id);
  expect(await indexedDBManager.get('metadata', CLIP_REVISION_KEY)).toBeUndefined();
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  for (let i = 0; i < 2; i++) expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(39);
  expect(count).toHaveBeenCalledTimes(2);
});

it.each(['synchronous', 'asynchronous'] as const)('propagates %s count failures and retries without publishing a cache', async mode => {
  vi.spyOn(IDBIndex.prototype, 'count').mockImplementation(() => {
    if (mode === 'synchronous') throw new Error('Count failed');
    const request = { error: new Error('Count failed'), onerror: null } as unknown as IDBRequest<number>;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(IndexedDBQuery.count('clips', 'createdAt')).rejects.toThrow('Count failed');
  vi.restoreAllMocks();
  const count = vi.spyOn(IDBIndex.prototype, 'count');
  expect(await IndexedDBQuery.count('clips', 'createdAt')).toBe(40); expect(count).toHaveBeenCalledOnce();
});

it('propagates revision-read errors even after warming a count', async () => {
  await IndexedDBQuery.count('clips', 'createdAt');
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
    const request = { error: new Error('Revision failed'), onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(IndexedDBQuery.count('clips', 'createdAt')).rejects.toThrow('Revision failed');
});
