import type { Clip } from '../../src/types/clip';
import { DB_CONFIG, STORE_CONFIGS } from '../../src/types/indexeddb';
import { buildClipIndex, lookupClipsForUrl } from '../../src/background/storage/clip-index';
import { normalizeClips } from '../../src/background/storage/utils/clip-normalizer';

(globalThis as any).chrome = { runtime: {
  onMessage: { addListener() {}, removeListener() {} }, sendMessage: () => Promise.resolve()
} };
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function measure(prepare: () => unknown, operation: () => Promise<unknown>, iterations = 1) {
  await prepare(); await operation();
  const samplesMs = [];
  for (let i = 0; i < 7; i++) {
    await prepare();
    const start = performance.now();
    for (let j = 0; j < iterations; j++) await operation();
    samplesMs.push((performance.now() - start) / iterations);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs };
}
function fixture(records: number, hits: number): Clip[] {
  return Array.from({ length: records }, (_, i) => ({
    id: String(i).padStart(5, '0'), highlightId: `highlight-${i}`,
    textContent: 'Performance fixture '.repeat(32), htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
    sourceUrl: i < hits ? `https://example.com/article/?tag=${i % 2}#fragment` : `https://other.com/${i}`,
    createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString(), updatedAt: '2025-02-01T00:00:00.000Z'
  }));
}

try {
  const legacy = fixture(10000, 10);
  const oldVersion = new URLSearchParams(location.search).has('legacy-v4') ? 4 : 3;
  const clipUrlRecord = oldVersion === 4 ? (await import('../../src/background/storage/utils/clip-url-record')).clipUrlRecord : undefined;
  const open = indexedDB.open(DB_CONFIG.name, oldVersion);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const config of STORE_CONFIGS.filter(config => config.name !== 'clipUrls')) {
      const store = db.createObjectStore(config.name, { keyPath: config.keyPath });
      for (const index of config.indexes.filter(index => index.name !== 'urlKey')) store.createIndex(index.name, index.keyPath, index.options);
    }
    db.createObjectStore('unknown');
    if (oldVersion === 4) db.createObjectStore('clipUrls', { keyPath: 'id' }).createIndex('urlKey', 'key');
  };
  const old = await request(open);
  const tx = old.transaction(Array.from(old.objectStoreNames), 'readwrite');
  legacy.forEach(clip => {
    tx.objectStore('clips').put(clip);
    if (clipUrlRecord) tx.objectStore('clipUrls').put(clipUrlRecord(clip));
  });
  tx.objectStore('unknown').put('preserve', 'key');
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  old.close();
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { IndexedDBQuery } = await import('../../src/background/indexeddb-query');
  const { getClips, getClipsForUrl } = await import('../../src/background/storage');
  const { cacheManager } = await import('../../src/background/storage/cache-manager');
  const { syncManager } = await import('../../src/background/storage/sync-manager');
  const start = performance.now();
  await indexedDBManager.init();
  const upgradeMs = performance.now() - start;
  const retained = await indexedDBManager.getAllData('clips');
  assert(JSON.stringify(retained) === JSON.stringify(legacy), 'Migration changed clip data');
  const upgraded = await request(indexedDB.open(DB_CONFIG.name));
  assert(upgraded.objectStoreNames.contains('unknown'), 'Migration deleted unknown store');
  assert(await request(upgraded.transaction('unknown').objectStore('unknown').get('key')) === 'preserve', 'Migration lost unknown data');
  if (DB_CONFIG.version === 5 && oldVersion === 4) assert(!upgraded.objectStoreNames.contains('clipUrls'), 'Migration retained retired URL data');
  upgraded.close();

  const results = [], allocations = [];
  let allocationFixture: Clip[] | null = null;
  const sizes = [100, 10000];
  if (location.search) sizes.reverse();
  for (const records of sizes) {
    const hitCounts = records === 100 ? [0, 1, 10, 24, 25, 100] : [0, 1, 10, 100, 256, 257, 1000, 2500, 5000, 10000];
    if (location.search) hitCounts.reverse();
    for (const hits of hitCounts) {
      const clips = fixture(records, hits);
      const url = 'https://example.com/article?tag=0';
      const expected = lookupClipsForUrl(buildClipIndex(normalizeClips(clips.toReversed())), url).map(clip => clip.id).join(',');
      const seed = async () => {
        cacheManager.clear();
        await indexedDBManager.clear('clips');
        await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
      };
      await seed();
      let found: Clip[] = [];
      const operation = async () => { found = await getClipsForUrl(url); };
      const verify = () => assert(found.map(clip => clip.id).join(',') === expected, `Wrong page order: ${records}/${hits}`);
      const cold = await measure(() => cacheManager.clear(), operation);
      verify();
      const warm = await measure(() => {}, operation, hits > 1000 ? 100 : 1000);
      verify();
      assert((await getClips()).length === records, 'Page leaked into whole-cache read');
      results.push({ records, hits, cold, warm });
      if ([1, 100, 256, 257, 1000, 2500, 10000].includes(hits)) allocations.push({ records, name: `page-${hits}`, prepare: async () => {
        cacheManager.clear();
        if (allocationFixture !== clips) { await seed(); allocationFixture = clips; }
      }, operation, verify });
    }
  }
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'page-cache', oldVersion, newVersion: DB_CONFIG.version, upgradeMs, migratedRecords: retained.length, results };
  (window as any).__performanceCleanup = () => { syncManager.close(); indexedDBManager.close(); };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
