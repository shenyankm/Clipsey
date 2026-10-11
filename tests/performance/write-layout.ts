import type { Clip } from '../../src/types/clip';
import { STORE_CONFIGS } from '../../src/types/indexeddb';
import { normalizeClips } from '../../src/background/storage/utils/clip-normalizer';
import { clipUrlRecord } from '../../src/background/storage/utils/clip-url-record';
import { CacheManager } from '../../src/background/storage/cache-manager';

(globalThis as any).chrome = { runtime: {
  onMessage: { addListener() {}, removeListener() {} }, sendMessage: () => Promise.resolve()
} };
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function measure(prepare: () => unknown, operation: () => Promise<unknown>) {
  await prepare(); await operation();
  const samplesMs = [];
  for (let i = 0; i < 7; i++) {
    await prepare();
    const start = performance.now();
    await operation();
    samplesMs.push(performance.now() - start);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs };
}

let experiment: IDBDatabase | undefined;
try {
  const open = indexedDB.open('ClipseyWriteLayoutExperiment', 1);
  open.onupgradeneeded = () => {
    const store = open.result.createObjectStore('clips', { keyPath: 'id' });
    for (const index of STORE_CONFIGS.find(config => config.name === 'clips')!.indexes.filter(index => index.name !== 'urlKey')) {
      store.createIndex(index.name, index.keyPath, index.options);
    }
    store.createIndex('urlKey', '__clipseyUrlKey');
  };
  experiment = await request(open);
  const transact = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T> | T) => {
    const tx = experiment!.transaction('clips', mode);
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
    try {
      const [value] = await Promise.all([Promise.resolve().then(() => operation(tx.objectStore('clips'))), completed]);
      return value;
    } catch (error) { try { tx.abort(); } catch {} throw error; }
  };
  const strip = (clips: (Clip & { __clipseyUrlKey?: IDBValidKey })[]) => {
    for (const clip of clips) delete clip.__clipseyUrlKey;
    return clips;
  };
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { saveClips, getClips, getClipsForUrl } = await import('../../src/background/storage');
  const { cacheManager } = await import('../../src/background/storage/cache-manager');
  const { syncManager } = await import('../../src/background/storage/sync-manager');
  const results = [];
  const sidecar = STORE_CONFIGS.some(config => config.name === 'clipUrls');
  const sizes = [100, 10000];
  if (location.search) sizes.reverse();
  for (const records of sizes) {
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), highlightId: `highlight-${i}`, textContent: 'Performance fixture '.repeat(32),
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`, sourceUrl: `https://example.com/article/${i % 1000}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString(), updatedAt: '2025-02-01T00:00:00.000Z'
    }));
    const expected = JSON.stringify(normalizeClips(clips).toReversed());
    const expectedUrl = JSON.stringify(normalizeClips(clips).toReversed().filter(clip => clip.sourceUrl === 'https://example.com/article/0'));
    const indexedCache = new CacheManager();
    const groupedOperation = async () => {
      const normalized = normalizeClips(clips);
      assert(normalized.length === clips.length, 'Invalid grouped input');
      await indexedDBManager.executeTransaction('clips', 'readwrite', async tx => {
        const store = tx.objectStore('clips');
        const urls = tx.objectStore('clipUrls');
        urls.clear();
        store.clear();
        for (const clip of normalized) store.put(clip);
        for (const clip of normalized) urls.put(clipUrlRecord(clip));
      });
      cacheManager.clear(); syncManager.notifyChange();
    };
    const indexedOperation = async () => {
      const normalized = normalizeClips(clips);
      assert(normalized.length === clips.length, 'Invalid indexed input');
      await transact('readwrite', store => {
        store.clear();
        for (const clip of normalized) store.put({ ...clip, __clipseyUrlKey: clipUrlRecord(clip).key });
      });
      indexedCache.clear();
      syncManager.notifyChange();
    };
    const operations: [string, () => Promise<void>][] = [['currentWrite', () => saveClips(clips)], ['indexedWrite', indexedOperation]];
    if (sidecar) operations.splice(1, 0, ['groupedWrite', groupedOperation]);
    if (location.search) operations.reverse();
    const writes: Record<string, Awaited<ReturnType<typeof measure>>> = {};
    for (const [name, operation] of operations) writes[name] = await measure(() => {}, operation);
    if (sidecar) {
      const metadata = await indexedDBManager.executeTransaction('clipUrls', 'readonly', tx => request(tx.objectStore('clipUrls').getAll()));
      assert(JSON.stringify(metadata) === JSON.stringify(clips.map(clip => clipUrlRecord(clip))), 'Wrong current/grouped metadata');
    }
    const indexedRaw = await transact('readonly', store => request(store.getAll()));
    assert(JSON.stringify(indexedRaw) === JSON.stringify(normalizeClips(clips).map(clip => ({ ...clip, __clipseyUrlKey: clipUrlRecord(clip).key }))), 'Wrong indexed stored metadata');
    let result: Clip[] = [];
    const currentColdAll = await measure(() => cacheManager.clear(), async () => { result = await getClips(); });
    assert(JSON.stringify(result) === expected, 'Wrong current full result');
    const currentColdUrl = await measure(() => cacheManager.clear(), async () => { result = await getClipsForUrl('https://example.com/article/0'); });
    assert(JSON.stringify(result) === expectedUrl, 'Wrong current URL result');
    const all = () => transact('readonly', async store => strip((await request(store.index('createdAt_id').getAll())).reverse()));
    const indexedColdAll = await measure(() => indexedCache.clear(), async () => {
      result = await indexedCache.get(all);
    });
    assert(JSON.stringify(result) === expected, 'Wrong indexed full result');
    const indexedColdUrl = await measure(() => indexedCache.clear(), async () => {
      result = await indexedCache.getByUrl('https://example.com/article/0', all, base =>
        transact('readonly', async store => strip((await request(store.index('urlKey').getAll(IDBKeyRange.bound([base], [base, []])))).reverse())));
    });
    assert(JSON.stringify(result) === expectedUrl, 'Wrong indexed URL result');
    results.push({ records, ...writes, currentColdAll, indexedColdAll, currentColdUrl, indexedColdUrl });
  }
  (window as any).__performanceResult = { scenario: 'write-layout', userAgent: navigator.userAgent, results };
  (window as any).__performanceCleanup = () => { experiment?.close(); syncManager.close(); indexedDBManager.close(); };
} catch (error) {
  experiment?.close();
  (window as any).__performanceResult = { error: String(error) };
}
