// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let manager: typeof import('@/background/indexeddb').indexedDBManager;

beforeEach(async () => {
  vi.resetModules();
  manager = (await import('@/background/indexeddb')).indexedDBManager;
});
afterEach(() => {
  vi.restoreAllMocks();
  manager.close();
});

function failNextOpen() {
  return vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
    const request = { error: new DOMException('Temporary failure'), onerror: null } as unknown as IDBOpenDBRequest;
    queueMicrotask(() => request.onerror!(new Event('error')));
    return request;
  });
}

it('shares an initial failure and retries with a new connection', async () => {
  const open = failNextOpen();
  const results = await Promise.allSettled([manager.init(), manager.init()]);
  expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(open).toHaveBeenCalledTimes(1);
  await manager.init();
  expect(open).toHaveBeenCalledTimes(2);
  expect(manager.isInitialized()).toBe(true);
});

it('retries an open failure after an established connection closes', async () => {
  await manager.init();
  manager.close();
  const open = failNextOpen();
  await expect(manager.init()).rejects.toThrow('Failed to open');
  await manager.init();
  expect(open).toHaveBeenCalledTimes(2);
  expect(await manager.count('clips')).toBe(0);
});

it('retries a failed reopen on the same database instance', async () => {
  const { IndexedDB } = await import('@/background/indexeddb');
  const { DB_CONFIG } = await import('@/types/indexeddb');
  const db = await IndexedDB.create(DB_CONFIG.name, DB_CONFIG.version);
  db.close();
  const open = failNextOpen();
  try {
    await expect(db.init()).rejects.toThrow('Failed to open');
    await db.init();
    expect(open).toHaveBeenCalledTimes(2);
    expect(db.isInitialized()).toBe(true);
  } finally {
    db.close();
  }
});
