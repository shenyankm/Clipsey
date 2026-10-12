// @vitest-environment node

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIP_URL_KEY, DB_CONFIG, STORE_CONFIGS } from '@/types/indexeddb';
import { clipUrlRecord } from '@/background/storage/utils/clip-url-record';

let manager: typeof import('@/background/indexeddb').indexedDBManager;
const rows = [
  { id: 'valid', sourceUrl: 'https://example.com/article/?q=1#text', textContent: 'valid', createdAt: '2025-01-01', extra: { date: new Date('2025-01-01') } },
  { id: 12, sourceUrl: 'https://example.com/article', textContent: 'legacy', createdAt: '2025-01-01' }
];
beforeEach(async () => {
  vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory());
  manager = (await import('@/background/indexeddb')).indexedDBManager;
});
afterEach(() => { manager.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function open(version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_CONFIG.name, version);
  request.onupgradeneeded = () => upgrade?.(request.result);
  return read(request);
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
}
async function seed(version = 3, modify?: (db: IDBDatabase, tx: IDBTransaction) => void) {
  const db = await open(version, db => {
    for (const config of STORE_CONFIGS) {
      const store = db.createObjectStore(config.name, { keyPath: config.keyPath });
      for (const index of config.indexes.filter(index => index.name !== 'urlKey')) store.createIndex(index.name, index.keyPath, index.options);
    }
    db.createObjectStore('unknown');
    if (version === 4) db.createObjectStore('clipUrls', { keyPath: 'id' }).createIndex('urlKey', 'key');
  });
  const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
  rows.forEach(row => {
    tx.objectStore('clips').put(row);
    if (version === 4) tx.objectStore('clipUrls').put(clipUrlRecord(row as any));
  });
  tx.objectStore('unknown').put('keep', 'key');
  modify?.(db, tx); await complete(tx); db.close();
}

it.each([3, 4])('upgrades v%i, preserves public/unknown data, and retires only the managed sidecar', async version => {
  await seed(version); await manager.init();
  expect(await manager.getAllData('clips')).toEqual([rows[1], rows[0]]);
  manager.close(); const db = await open(5);
  expect(db.objectStoreNames.contains('clipUrls')).toBe(false);
  expect(await read(db.transaction('unknown').objectStore('unknown').get('key'))).toBe('keep');
  const store = db.transaction('clips').objectStore('clips');
  expect(await read(store.getAll())).toEqual([
    { ...rows[1], [CLIP_URL_KEY]: [''] },
    { ...rows[0], [CLIP_URL_KEY]: ['https://example.com/article', '2025-01-01', 'valid'] }
  ]); db.close();
});
it.each([3, 4])('rolls back failed v%i backfill and allows retry', async version => {
  await seed(version);
  const update = IDBCursor.prototype.update; let writes = 0;
  const fault = vi.spyOn(IDBCursor.prototype, 'update').mockImplementation(function (this: IDBCursor, value) {
    if (++writes === 2) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return update.call(this, value);
  });
  await expect(manager.init()).rejects.toThrow('Failed to open'); fault.mockRestore();
  const db = await open(version);
  expect(db.version).toBe(version);
  expect(db.objectStoreNames.contains('clipUrls')).toBe(version === 4);
  expect(await read(db.transaction('clips').objectStore('clips').getAll())).toEqual([rows[1], rows[0]]);
  if (version === 4) expect(await read(db.transaction('clipUrls').objectStore('clipUrls').count())).toBe(2);
  db.close(); await manager.init();
  expect(await manager.getAllData('clips')).toEqual([rows[1], rows[0]]);
});
it('preserves out-of-line keys, null values and fields that are not owned by Clipsey', async () => {
  const db = await open(3, db => db.createObjectStore('clips'));
  const tx = db.transaction('clips', 'readwrite');
  tx.objectStore('clips').put(null, 'legacy');
  tx.objectStore('clips').put({ [CLIP_URL_KEY]: 'user data' }, 'other');
  await complete(tx); db.close(); await manager.init();
  expect(await manager.get('clips', 'legacy')).toBeNull();
  expect(await manager.get('clips', 'other')).toEqual({ [CLIP_URL_KEY]: 'user data' });
});
it('preserves a sparse array and its additional legacy fields', async () => {
  const db = await open(3, db => db.createObjectStore('clips', { keyPath: 'id' }));
  const row = Object.assign(new Array(3), rows[0]); row[2] = 'keep';
  const tx = db.transaction('clips', 'readwrite'); tx.objectStore('clips').put(row);
  await complete(tx); db.close(); await manager.init();
  expect(await manager.get('clips', 'valid')).toStrictEqual(row);
});
it('preserves an unknown v3 store with the retired URL-store name', async () => {
  const db = await open(3, db => { db.createObjectStore('clips', { keyPath: 'id' }); db.createObjectStore('clipUrls'); });
  const tx = db.transaction('clipUrls', 'readwrite'); tx.objectStore('clipUrls').put('preserve', 'unknown-key');
  await complete(tx); db.close(); await manager.init(); manager.close();
  const upgraded = await open(5);
  expect(await read(upgraded.transaction('clipUrls').objectStore('clipUrls').get('unknown-key'))).toBe('preserve'); upgraded.close();
});
it.each(['body', 'sidecar', 'sidecar-key'])('aborts v4 upgrade on unknown %s data instead of overwriting or deleting it', async target => {
  await seed(4, (_db, tx) => {
    if (target === 'body') tx.objectStore('clips').put({ ...rows[0], [CLIP_URL_KEY]: 'preserve' });
    else if (target === 'sidecar') tx.objectStore('clipUrls').put({ id: 'unknown', key: [''], extra: 'preserve' });
    else tx.objectStore('clipUrls').put({ id: 'unknown', key: Object.assign([''], { extra: 'preserve' }) });
  });
  await expect(manager.init()).rejects.toThrow('Failed to open');
  const db = await open(4); expect(db.objectStoreNames.contains('clipUrls')).toBe(true);
  expect(db.transaction('clips').objectStore('clips').indexNames.contains('urlKey')).toBe(false);
  const request = target === 'body' ? db.transaction('clips').objectStore('clips').get('valid') : db.transaction('clipUrls').objectStore('clipUrls').get('unknown');
  const row = await read(request);
  if (target === 'sidecar-key') expect(row.key.extra).toBe('preserve');
  else expect(row).toMatchObject(target === 'body' ? { [CLIP_URL_KEY]: 'preserve' } : { extra: 'preserve' });
  db.close();
});
it('aborts if an existing index uses the reserved name', async () => {
  const db = await open(3, db => db.createObjectStore('clips', { keyPath: 'id' }).createIndex('urlKey', 'extra')); db.close();
  await expect(manager.init()).rejects.toThrow('Failed to open');
  const original = await open(3);
  expect(original.transaction('clips').objectStore('clips').index('urlKey').keyPath).toBe('extra'); original.close();
});

it('does not retire a v4 sidecar with an unknown schema', async () => {
  const db = await open(4, db => {
    db.createObjectStore('clips', { keyPath: 'id' });
    db.createObjectStore('clipUrls', { keyPath: 'other' }).createIndex('urlKey', 'key');
  });
  const tx = db.transaction('clipUrls', 'readwrite');
  tx.objectStore('clipUrls').put({ other: 'unknown', payload: 'preserve' });
  await complete(tx); db.close();
  await expect(manager.init()).rejects.toThrow('Failed to open');
  const original = await open(4);
  expect(await read(original.transaction('clipUrls').objectStore('clipUrls').get('unknown'))).toEqual({ other: 'unknown', payload: 'preserve' });
  original.close();
});
