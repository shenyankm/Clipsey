// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';
import type { QueryOptions } from '@/types/indexeddb';

const clips: Clip[] = Array.from({ length: 600 }, (_, i) => ({
  id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i}` : undefined,
  textContent: `Text ${i % 5}`, htmlContent: `<b>rich ${i}</b>`,
  sourceUrl: `https://example.com/${Math.floor(i / 2)}`,
  createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
}));
beforeEach(async () => {
  vi.restoreAllMocks();
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', clips);
});
afterAll(() => { vi.restoreAllMocks(); indexedDBManager.close(); });

const sources = [undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id']
  .flatMap(indexName => (['next', 'prev'] as const).map(direction => ({ indexName, direction })));
it.each(sources)('keeps complete rows and duplicate-key order for $indexName / $direction', async options => {
  const expected = await IndexedDBQuery.getAll('clips', options);
  const keyCursor = vi.spyOn(options.indexName ? IDBIndex.prototype : IDBObjectStore.prototype, 'openKeyCursor');
  const valueCursor = vi.spyOn(options.indexName ? IDBIndex.prototype : IDBObjectStore.prototype, 'openCursor');
  const get = vi.spyOn(IDBObjectStore.prototype, 'get');
  const result = await IndexedDBQuery.paginate('clips', 16, 20, options);
  expect(result.total).toBe(expected.length);
  expect(result.data).toEqual(expected.slice(300, 320));
  expect(keyCursor).toHaveBeenCalledOnce();
  expect(valueCursor).not.toHaveBeenCalled();
  expect(get.mock.contexts.filter(store => store.name === 'clips')).toHaveLength(20);
  expect(result.data.every(row => !('__clipseyUrlKey' in row) && !('updatedAt' in row))).toBe(true);
});

it('retains bounded-range order and numeric legacy primary keys with extra fields', async () => {
  const legacy = { ...clips[300]!, id: 300, legacyExtra: { date: new Date('2025-02-01'), preserved: true } } as unknown as Clip;
  await indexedDBManager.put('clips', legacy);
  const options: QueryOptions = { indexName: 'createdAt', query: IDBKeyRange.lowerBound(clips[0]!.createdAt) };
  const expected = await IndexedDBQuery.getAll('clips', options);
  const result = await IndexedDBQuery.getAll('clips', { ...options, offset: 300, limit: 20 });
  expect(result).toEqual(expected.slice(300, 320));
  expect(result[0]).toEqual(legacy);
});

it('keeps the same public fields when paging a different store', async () => {
  await indexedDBManager.clear('errorLogs');
  const logs = Array.from({ length: 350 }, (_, i) => ({ id: String(i).padStart(5, '0'), time: new Date(1700000000000 + i * 1000).toISOString(), message: `message ${i}`, context: 'fixture', stack: 'fixture stack' }));
  await IndexedDBQuery.bulkPut('errorLogs', logs);
  expect(await IndexedDBQuery.getAll('errorLogs', { indexName: 'time', offset: 300, limit: 20 })).toEqual(logs.slice(300, 320));
});

it('hydrates keys in the same snapshot before a queued write becomes visible', async () => {
  const get = IDBObjectStore.prototype.get;
  let writing: Promise<string> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    const request = get.call(this, key);
    if (this.name === 'clips' && key === clips[300]!.id && !writing) {
      writing = indexedDBManager.put('clips', { ...clips[300]!, textContent: 'changed' });
    }
    return request;
  });
  expect(await IndexedDBQuery.getAll('clips', { offset: 300, limit: 20 })).toEqual(clips.slice(300, 320));
  expect(writing).toBeDefined();
  await writing;
  expect((await IndexedDBQuery.getAll('clips', { offset: 300, limit: 20 }))[0]!.textContent).toBe('changed');
});

it.each([600, 620])('returns an empty page at offset %i without fetching records', async offset => {
  const get = vi.spyOn(IDBObjectStore.prototype, 'get');
  expect(await IndexedDBQuery.getAll('clips', { offset, limit: 20 })).toEqual([]);
  expect(get).not.toHaveBeenCalled();
});

it.each([
  { offset: 0, limit: 20 }, { offset: 20, limit: 20 }, { offset: 255, limit: 20 },
  { offset: 256.5, limit: 20 }, { offset: 300, limit: 2.5 },
  { offset: 300, limit: 0 }, { offset: 300 }, { offset: 300, limit: 101 }
])('keeps existing parameter behavior for $offset / $limit', async options => {
  const cursor = vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor');
  const end = options.limit ? Math.ceil(options.offset) + Math.ceil(options.limit) : undefined;
  expect(await IndexedDBQuery.getAll('clips', options)).toEqual(clips.slice(Math.ceil(options.offset), end));
  expect(cursor).not.toHaveBeenCalled();
});

it('preserves unique index cursor representatives for a large offset', async () => {
  const expected = await IndexedDBQuery.getAll('clips', { indexName: 'sourceUrl', direction: 'nextunique' });
  const cursor = vi.spyOn(IDBIndex.prototype, 'openKeyCursor');
  expect(await IndexedDBQuery.getAll('clips', { indexName: 'sourceUrl', direction: 'nextunique', offset: 256, limit: 20 }))
    .toEqual(expected.slice(256, 276));
  expect(cursor).not.toHaveBeenCalled();
});

it('propagates synchronous key-cursor failures', async () => {
  vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor').mockImplementation(() => { throw new DOMException('Key cursor failed', 'InvalidStateError'); });
  await expect(IndexedDBQuery.getAll('clips', { offset: 300, limit: 20 })).rejects.toThrow('Key cursor failed');
});

it('propagates asynchronous key-cursor failures', async () => {
  vi.spyOn(IDBObjectStore.prototype, 'openKeyCursor').mockImplementation(() => {
    const request = { error: new Error('Key cursor failed'), onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(IndexedDBQuery.getAll('clips', { offset: 300, limit: 20 })).rejects.toThrow('Failed to query records');
});

it.each(['synchronous', 'asynchronous'])('fails the whole page on a %s hydration error', async mode => {
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
    if (mode === 'synchronous') throw new DOMException('Lookup failed', 'InvalidStateError');
    const request = { error: new Error('Lookup failed'), onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(IndexedDBQuery.getAll('clips', { offset: 300, limit: 20 })).rejects.toThrow(mode === 'synchronous' ? 'Lookup failed' : 'Failed to query records');
});
