import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import { CLIP_REVISION_KEY } from '@/types/indexeddb';
import type { Clip } from '@/types/clip';

const clips: Clip[] = Array.from({ length: 600 }, (_, i) => ({
  id: String(i).padStart(4, '0'), title: i % 7 ? 'Needle title' : undefined,
  textContent: `needle ${i}`, htmlContent: `<b>rich ${i}</b>`,
  sourceUrl: 'https://example.com', createdAt: '2025-01-01T00:00:00Z'
}));
const search = (keyword = 'needle', fields: (keyof Clip)[] = ['textContent']) =>
  IndexedDBQuery.filterByKeywordPaged('clips', keyword, fields, 1, 20, { indexName: 'createdAt' });
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await indexedDBManager.clear('clips');
  await IndexedDBQuery.bulkPut('clips', clips);
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); indexedDBManager.close(); });

it('reuses only search fields while hydrating complete unnormalized rows', async () => {
  const original = { ...clips[0]!, textContent: '', legacyExtra: { preserved: true } };
  await indexedDBManager.put('clips', original);
  const cold = await search('');
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await search('')).toEqual(cold);
  expect(reads).not.toHaveBeenCalled();
  expect(cold.items[0]).toEqual(original);
  expect(cold.items[0]).not.toHaveProperty('updatedAt');
});

it('checks a revision in the same snapshot and sees a queued write next time', async () => {
  await search();
  const read = IDBObjectStore.prototype.get;
  let writing: Promise<string> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    const request = read.call(this, key);
    if (this.name === 'metadata' && key === CLIP_REVISION_KEY && !writing) {
      writing = indexedDBManager.put('clips', { ...clips[0]!, textContent: 'changed' });
    }
    return request;
  });
  expect((await search('changed')).total).toBe(0);
  await writing;
  expect((await search('changed')).items).toEqual([{ ...clips[0]!, textContent: 'changed' }]);
});

it('rolls back the marker on write failure and keeps the valid snapshot', async () => {
  const expected = await search();
  const revision = await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
  expect(Number.isNaN(Date.parse(revision!.createdAt))).toBe(false);
  expect(revision!.updatedAt).toBe(revision!.createdAt);
  await expect(indexedDBManager.put('clips', { ...clips[0]!, id: undefined } as unknown as Clip)).rejects.toThrow();
  expect(await indexedDBManager.get('metadata', CLIP_REVISION_KEY)).toEqual(revision);
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await search()).toEqual(expected);
  expect(reads).not.toHaveBeenCalled();
});

it('uses the existing ID fallback when randomUUID is unavailable', async () => {
  await search();
  vi.stubGlobal('crypto', {});
  await indexedDBManager.put('clips', { ...clips[0]!, textContent: 'changed' });
  expect((await indexedDBManager.get('metadata', CLIP_REVISION_KEY))?.value).toMatch(/^clip-/);
  expect((await search('changed')).total).toBe(1);
});

it.each(['delete', 'put'] as const)('can %s clips when the revision write hits quota, without reusing stale results', async operation => {
  await search();
  const put = IDBObjectStore.prototype.put;
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key?) {
    if (this.name !== 'metadata') return put.call(this, value, key);
    // 真实请求错误及事务默认回滚；只替换错误身份模拟配额不足。
    const request = add.call(this, value, key);
    Object.defineProperty(request, 'error', { get: () => new DOMException('Quota full', 'QuotaExceededError'), set() {} });
    return request;
  });
  if (operation === 'delete') await indexedDBManager.delete('clips', clips[0]!.id);
  else await indexedDBManager.put('clips', { ...clips[0]!, textContent: 'changed' });
  expect(await indexedDBManager.get('metadata', CLIP_REVISION_KEY)).toBeUndefined();
  expect((await search()).total).toBe(599);
  if (operation === 'put') expect((await search('changed')).items).toEqual([{ ...clips[0]!, textContent: 'changed' }]);
});

it('keeps non-quota metadata errors fatal and rolls back the clip operation', async () => {
  const expected = await search();
  const revision = await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
  const put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key?) {
    return this.name === 'metadata' ? add.call(this, value, key) : put.call(this, value, key);
  });
  await expect(indexedDBManager.delete('clips', clips[0]!.id)).rejects.toThrow();
  vi.restoreAllMocks();
  expect(await indexedDBManager.get('metadata', CLIP_REVISION_KEY)).toEqual(revision);
  expect(await search()).toEqual(expected);
});

it('does not reuse a markerless legacy database after a write and metadata reset', async () => {
  await indexedDBManager.clear('metadata'); await search();
  await indexedDBManager.put('clips', { ...clips[0]!, textContent: 'changed' });
  await indexedDBManager.clear('metadata');
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect((await search('changed')).total).toBe(1);
  expect((await search('changed')).total).toBe(1);
  expect(reads).toHaveBeenCalledTimes(6);
});

it('keeps custom fields on the original batched path', async () => {
  await search();
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect((await search('rich 0', ['htmlContent'])).items).toEqual([clips[0]]);
  expect(reads).toHaveBeenCalledTimes(3);
  expect((await search()).total).toBe(600);
  expect(reads).toHaveBeenCalledTimes(3);
});

it.each([
  ['record count', () => Array.from({ length: 10001 }, (_, i) => ({ ...clips[0]!, id: String(i) }))],
  ['field weight', () => [{ ...clips[0]!, textContent: 'x'.repeat(8 * 1024 * 1024) }]],
  ['non-string legacy field', () => [{ ...clips[0]!, title: { text: 'old' } } as unknown as Clip]]
] as const)('retains bounded native scanning beyond %s cache eligibility', async (_name, create) => {
  await indexedDBManager.clear('clips'); await IndexedDBQuery.bulkPut('clips', create());
  const expected = await search('');
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await search('')).toEqual(expected);
  expect(reads).toHaveBeenCalled();
  expect(reads.mock.calls.every(([, count]) => count === 256)).toBe(true);
});

it('does not carry snapshots across database connection replacement', async () => {
  const expected = await search(); indexedDBManager.close();
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect(await search()).toEqual(expected); expect(reads).toHaveBeenCalledTimes(3);
});

it('publishes no snapshot when final page hydration fails', async () => {
  const read = IDBObjectStore.prototype.get;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function(this: IDBObjectStore, key) {
    if (this.name !== 'clips') return read.call(this, key);
    const request = { error: new Error('Hydration failed'), onerror: null } as unknown as IDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
  await expect(search()).rejects.toThrow('Failed to query with keyword');
  vi.restoreAllMocks();
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  expect((await search()).total).toBe(600); expect(reads).toHaveBeenCalledTimes(3);
});
