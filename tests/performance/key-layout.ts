import type { Clip } from '../../src/types/clip';
import { CLIP_URL_KEY, STORE_CONFIGS } from '../../src/types/indexeddb';
import { withClipUrlKey } from '../../src/background/storage/utils/clip-url-record';
import { normalizeClips } from '../../src/background/storage/utils/clip-normalizer';
import { createIndexKeys } from '../../src/background/storage/utils/url-normalizer';
import { CacheManager } from '../../src/background/storage/cache-manager';

(globalThis as any).chrome = { runtime: {
  onMessage: { addListener() {}, removeListener() {} }, sendMessage: () => Promise.resolve()
} };
const legacyField = '__clipseyLegacyUrl';
function assert(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(message); }
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function measure(prepare: () => unknown, operation: () => Promise<unknown>) {
  await prepare(); await operation();
  const samplesMs = [];
  for (let i = 0; i < 7; i++) {
    await prepare(); const start = performance.now(); await operation(); samplesMs.push(performance.now() - start);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs };
}
let db: IDBDatabase | undefined;
try {
  const open = indexedDB.open('ClipseyCompactKeyExperiment', 1);
  open.onupgradeneeded = () => {
    const store = open.result.createObjectStore('clips', { keyPath: 'id' });
    for (const index of STORE_CONFIGS.find(config => config.name === 'clips')!.indexes.filter(index => index.name !== 'urlKey')) {
      store.createIndex(index.name, index.keyPath, index.options);
    }
    store.createIndex('urlKey', [CLIP_URL_KEY, 'createdAt', 'id']);
    store.createIndex('legacyUrl', legacyField);
  };
  db = await request(open);
  const transact = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T> | T) => {
    const tx = db!.transaction('clips', mode);
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
    try {
      const [result] = await Promise.all([Promise.resolve().then(() => operation(tx.objectStore('clips'))), completed]);
      return result;
    } catch (error) { try { tx.abort(); } catch {} throw error; }
  };
  const encode = (clip: Clip, id?: IDBValidKey) => {
    if (Object.hasOwn(clip, legacyField)) throw new Error('Reserved legacy field');
    const record = withClipUrlKey(clip, id);
    const key = record[CLIP_URL_KEY];
    Reflect.set(record, CLIP_URL_KEY, key?.length === 3 ? key[0] : undefined);
    if (key?.length === 1) Reflect.set(record, legacyField, 1);
    return record;
  };
  const decode = (rows: Clip[]) => {
    for (const row of rows) { Reflect.deleteProperty(row, CLIP_URL_KEY); Reflect.deleteProperty(row, legacyField); }
    return rows;
  };
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { saveClips, getClips, getClipsForUrl } = await import('../../src/background/storage');
  const { cacheManager } = await import('../../src/background/storage/cache-manager');
  const { syncManager } = await import('../../src/background/storage/sync-manager');
  const compactCache = new CacheManager();
  const rawCache = new CacheManager();
  const copyCache = new CacheManager();
  const rawAll = () => indexedDBManager.executeTransaction('clips', 'readonly', async tx =>
    (await request<Clip[]>(tx.objectStore('clips').index('createdAt_id').getAll())).reverse());
  const copiedAll = async () => (await rawAll()).map(row => {
    const { [CLIP_URL_KEY]: _private, ...publicRow } = row as Clip & { [CLIP_URL_KEY]?: unknown };
    return publicRow;
  });
  const saveCompact = async (clips: Clip[]) => {
    const normalized = normalizeClips(clips);
    assert(normalized.length === clips.length, 'Invalid candidate input');
    await transact('readwrite', store => { store.clear(); for (const clip of normalized) store.put(encode(clip)); });
    compactCache.clear(); syncManager.notifyChange();
  };
  const all = () => transact('readonly', async store => decode((await request(store.index('createdAt_id').getAll())).reverse()));
  const page = (base: string) => transact('readonly', async store => {
    const index = store.index('urlKey');
    const range = IDBKeyRange.bound([base], [base, []]);
    const [legacy, ids] = await Promise.all([request(store.index('legacyUrl').count(1)), request(index.getAllKeys(range, 2501))]);
    if (legacy || ids.length > 2500) return null;
    if (ids.length >= 64) {
      const keys = await request(store.getAllKeys(undefined, 257));
      if (keys.length <= 256 && ids.length * 2 >= keys.length) return null;
    }
    const rows = await request<Clip[]>(index.getAll(range));
    if (rows.length !== ids.length) return null;
    for (const url of new Set(rows.map(row => row.sourceUrl))) if (createIndexKeys(url).at(-1) !== base) return null;
    return decode(rows.reverse());
  });
  const sizes = [100, 10000];
  if (location.search) sizes.reverse();
  const results = [], allocations = [];
  let seeded: Clip[] | null = null;
  for (const records of sizes) {
    const clips: Clip[] = Array.from({ length: records }, (_, i) => Object.freeze({
      id: String(i).padStart(5, '0'), highlightId: `highlight-${i}`, textContent: 'Performance fixture '.repeat(32),
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`, sourceUrl: `https://example.com/article/${i % 1000}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString(), updatedAt: '2025-02-01T00:00:00.000Z'
    }));
    const expected = JSON.stringify(normalizeClips(clips).toReversed());
    const url = 'https://example.com/article/0';
    const expectedUrl = JSON.stringify(normalizeClips(clips).toReversed().filter(clip => clip.sourceUrl === url));
    const operations: [string, () => Promise<void>][] = [['tupleWrite', () => saveClips(clips)], ['compactWrite', () => saveCompact(clips)]];
    if (location.search) operations.reverse();
    const writes: Record<string, Awaited<ReturnType<typeof measure>>> = {};
    for (const [name, operation] of operations) writes[name] = await measure(() => {}, operation);
    seeded = clips;
    const raw = await transact('readonly', store => request(store.getAll()));
    assert(JSON.stringify(raw) === JSON.stringify(normalizeClips(clips).map(clip => encode(clip))), 'Wrong compact data');
    assert(await transact('readonly', store => request(store.index('legacyUrl').count())) === 0, 'Legacy index has normal records');
    assert(clips.every(clip => !Object.hasOwn(clip, CLIP_URL_KEY) && !Object.hasOwn(clip, legacyField)), 'Input was modified');
    const paths = [
      { name: 'tupleAll', clear: () => cacheManager.clear(), run: () => getClips(), expected },
      { name: 'tupleRawAll', clear: () => rawCache.clear(), run: () => rawCache.get(rawAll), expected },
      { name: 'tupleCopyAll', clear: () => copyCache.clear(), run: () => copyCache.get(copiedAll), expected },
      { name: 'compactAll', clear: () => compactCache.clear(), run: () => compactCache.get(all), expected },
      { name: 'tupleUrl', clear: () => cacheManager.clear(), run: () => getClipsForUrl(url), expected: expectedUrl },
      { name: 'compactUrl', clear: () => compactCache.clear(), run: () => compactCache.getByUrl(url, all, page), expected: expectedUrl }
    ];
    if (location.search) paths.reverse();
    const reads: Record<string, Awaited<ReturnType<typeof measure>>> = {};
    for (const path of paths) {
      let found: Clip[] = [];
      const run = async () => { found = await path.run(); };
      const verify = () => assert(JSON.stringify(found) === path.expected, `Wrong ${path.name} result`);
      reads[path.name] = await measure(path.clear, run); verify();
      allocations.push({ records, name: path.name, prepare: async () => {
        if (seeded !== clips) { await saveClips(clips); await saveCompact(clips); seeded = clips; }
        cacheManager.clear(); compactCache.clear(); rawCache.clear(); copyCache.clear(); found = [];
      }, operation: run, verify });
    }
    results.push({ records, ...writes, ...reads });
  }
  // 旧异常记录必须触发全库回退，私有标记不能被当作摘录内容导出。
  const legacy = { id: 12, sourceUrl: 'https://example.com/article/0', textContent: 'legacy', createdAt: '2025' } as unknown as Clip;
  await transact('readwrite', store => { store.put(encode(legacy)); });
  assert(await page('https://example.com/article/0') === null, 'Legacy marker did not trigger fallback');
  assert((await all()).every(row => !Object.hasOwn(row, CLIP_URL_KEY) && !Object.hasOwn(row, legacyField)), 'Private field leaked');
  await transact('readwrite', store => { store.delete(12); });
  assert(await transact('readonly', store => request(store.index('legacyUrl').count())) === 0, 'Legacy marker survived deletion');
  seeded = null;
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { scenario: 'key-layout', experimental: true, userAgent: navigator.userAgent, results };
  (window as any).__performanceCleanup = () => { db?.close(); syncManager.close(); indexedDBManager.close(); };
} catch (error) {
  db?.close(); (window as any).__performanceResult = { error: String(error) };
}
