import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DB_CONFIG, STORE_CONFIGS } from '@/types/indexeddb';

let manager: typeof import('@/background/indexeddb').indexedDBManager;
const rows = [
  { id: 'valid', sourceUrl: 'https://example.com/article/?q=1#text', textContent: 'valid', createdAt: '2025-01-01', extra: 'preserve' },
  { id: 12, sourceUrl: 'https://example.com/article', textContent: 'legacy', createdAt: '2025-01-01' }
];

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  manager = (await import('@/background/indexeddb')).indexedDBManager;
});
afterEach(() => { manager.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function open(version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seed() {
  const db = await open(3, db => {
    for (const config of STORE_CONFIGS.filter(config => config.name !== 'clipUrls')) {
      const store = db.createObjectStore(config.name, { keyPath: config.keyPath });
      for (const index of config.indexes) store.createIndex(index.name, index.keyPath, index.options);
    }
    db.createObjectStore('unknown');
  });
  const tx = db.transaction(['clips', 'unknown'], 'readwrite');
  rows.forEach(row => tx.objectStore('clips').put(row));
  tx.objectStore('unknown').put('keep', 'key');
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  db.close();
}

it('upgrades old records without changing public data or deleting unknown stores', async () => {
  await seed();
  await manager.init();
  expect(await manager.getAllData('clips')).toEqual([rows[1], rows[0]]);
  expect(await manager.getAllData('clipUrls')).toEqual([
    { id: 12, key: [''] },
    { id: 'valid', key: ['https://example.com/article', '2025-01-01', 'valid'] }
  ]);
  manager.close();
  const db = await open(4);
  expect(db.objectStoreNames.contains('unknown')).toBe(true);
  const request = db.transaction('unknown').objectStore('unknown').get('key');
  expect(await new Promise(resolve => { request.onsuccess = () => resolve(request.result); })).toBe('keep');
  db.close();
});

it('rolls back a failed backfill and retries without losing the version-3 database', async () => {
  await seed();
  const put = IDBObjectStore.prototype.put;
  let writes = 0;
  const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
    if (this.name === 'clipUrls' && ++writes === 2) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return put.call(this, value, key);
  });
  await expect(manager.init()).rejects.toThrow('Failed to open');
  fault.mockRestore();
  const db = await open(3);
  expect(db.version).toBe(3);
  expect(db.objectStoreNames.contains('clipUrls')).toBe(false);
  expect(db.objectStoreNames.contains('unknown')).toBe(true);
  db.close();
  await manager.init();
  expect(await manager.count('clips')).toBe(2);
  expect(await manager.count('clipUrls')).toBe(2);
  expect(await manager.getAllData('clips')).toEqual([rows[1], rows[0]]);
});

it('preserves out-of-line keys and null legacy values during upgrade', async () => {
  const db = await open(3, db => db.createObjectStore('clips'));
  const tx = db.transaction('clips', 'readwrite');
  tx.objectStore('clips').put(null, 'legacy');
  await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
  db.close();
  await manager.init();
  expect(await manager.get('clips', 'legacy')).toBeNull();
  expect(await manager.get('clipUrls', 'legacy')).toEqual({ id: 'legacy', key: [''] });
});

it('aborts safely if an unknown legacy store already uses the URL-store name', async () => {
  const db = await open(3, db => { db.createObjectStore('clips', { keyPath: 'id' }); db.createObjectStore('clipUrls'); });
  const tx = db.transaction('clipUrls', 'readwrite');
  tx.objectStore('clipUrls').put('preserve', 'unknown-key');
  await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
  db.close();
  await expect(manager.init()).rejects.toThrow('Failed to open');
  const original = await open(3);
  const request = original.transaction('clipUrls').objectStore('clipUrls').get('unknown-key');
  expect(await new Promise(resolve => { request.onsuccess = () => resolve(request.result); })).toBe('preserve');
  original.close();
});
