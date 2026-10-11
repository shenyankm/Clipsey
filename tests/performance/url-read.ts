import { CacheManager } from '../../src/background/storage/cache-manager';
import { buildClipIndex, lookupClipsForUrl } from '../../src/background/storage/clip-index';
import { normalizeClips } from '../../src/background/storage/utils/clip-normalizer';
import { createIndexKeys } from '../../src/background/storage/utils/url-normalizer';
import type { Clip } from '../../src/types/clip';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type BulkRecord = { key: IDBValidKey; value: Clip };
type RecordIndex = IDBIndex & { getAllRecords?: () => IDBRequest<BulkRecord[]> };

try {
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { IndexedDBQuery } = await import('../../src/background/indexeddb-query');
  const { STORE_CONFIGS } = await import('../../src/types/indexeddb');
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ClipseyURLReadExperiment', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('clips', { keyPath: 'id' });
      for (const config of STORE_CONFIGS.find(config => config.name === 'clips')!.indexes) {
        store.createIndex(config.name, config.keyPath, config.options);
      }
      store.createIndex('canonicalBase_createdAt_id', ['canonicalBase', 'createdAt', 'id']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Experimental database failed'));
  });
  const url = 'https://example.com/article?a=1&b=2';
  // shortcut: 实验只用合法日期/ID；接入存储前需验证旧记录与迁移回滚。
  const base = createIndexKeys(url).at(-1)!;
  const results = [];
  const allocations = [];
  let allocationFixture: Clip[] | null = null;
  const methodOrder = ['full-cache', 'key-scan', 'canonical-index', 'indexed-cache'] as const;
  const methods = new URLSearchParams(location.search).has('reverse') ? [...methodOrder].reverse() : [...methodOrder];
  for (const records of [100, 10000]) for (const distribution of ['sparse', 'dense'] as const) {
    const urls = ['https://EXAMPLE.com:443/article/?b=2&a=1#section', 'https://example.com/article?a=1&b=3',
      'https://example.com/article///?a=1&b=2', 'https://example.com/article'];
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), highlightId: `highlight-${Math.floor(i / 2)}`,
      textContent: `Entry ${i} ${'text '.repeat(128)}`, htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: distribution === 'dense' || i % 1000 === 0 ? urls[Math.floor(i / 1000) % urls.length]! : `https://elsewhere.com/entry/${i}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + (i % 5000) * 1000).toISOString(), updatedAt: '2025-02-01T00:00:00.000Z'
    }));
    const seed = async () => {
      await indexedDBManager.clear('clips');
      await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
      // 派生字段和索引写入在计时外；此实验不证明迁移或写入成本。
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('clips', 'readwrite');
        const store = transaction.objectStore('clips');
        store.clear();
        for (const clip of clips) store.put({ ...clip, canonicalBase: createIndexKeys(clip.sourceUrl).at(-1) });
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Experimental seed failed'));
      });
    };
    await seed();
    const compare = (a: Clip, b: Clip) => indexedDB.cmp([b.createdAt, b.id], [a.createdAt, a.id]);
    const expected = lookupClipsForUrl(buildClipIndex(normalizeClips([...clips].sort(compare))), url);
    const cache = new CacheManager();
    // shortcut: 原型页缓存只服务一个基础 URL；接入时需验证全量读取、跨 URL 并发及失效。
    const pageCache = new CacheManager();
    const full = () => cache.getByUrl(url, () => IndexedDBQuery.getAll('clips', { indexName: 'createdAt_id', direction: 'prev' }));
    const keyScan = () => indexedDBManager.executeTransaction('clips', 'readonly', transaction => {
      const source = transaction.objectStore('clips').index('sourceUrl') as RecordIndex;
      assert(typeof source.getAllRecords === 'function', 'getAllRecords is unavailable');
      return new Promise<Clip[]>((resolve, reject) => {
        const request = source.getAllRecords!();
        request.onerror = () => reject(request.error ?? new Error('Record scan failed'));
        request.onsuccess = () => {
          try {
            const selected: Clip[] = [];
            let previous: IDBValidKey | undefined;
            let keys: string[] = [];
            for (const record of request.result) {
              if (record.key !== previous) {
                previous = record.key;
                keys = typeof record.key === 'string' ? createIndexKeys(record.key) : [];
              }
              if (keys.at(-1) === base) selected.push(record.value);
            }
            resolve(lookupClipsForUrl(buildClipIndex(normalizeClips(selected.sort(compare))), url));
          } catch (error) { reject(error); }
        };
      });
    });
    const readCanonicalRows = () => new Promise<Clip[]>((resolve, reject) => {
      const transaction = database.transaction('clips', 'readonly');
      const range = IDBKeyRange.bound([base], [base, []]);
      const request = transaction.objectStore('clips').index('canonicalBase_createdAt_id').getAll(range);
      let selected: Clip[] = [];
      request.onsuccess = () => { selected = request.result; };
      transaction.oncomplete = () => {
        resolve(selected.reverse());
      };
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Experimental URL index failed'));
    });
    const canonicalIndex = async () => lookupClipsForUrl(buildClipIndex(normalizeClips(await readCanonicalRows())), url);
    const indexedCache = () => pageCache.getByUrl(url, readCanonicalRows);
    const check = (found: Clip[]) => assert(JSON.stringify(found) === JSON.stringify(expected), 'Wrong URL result, priority, tie order or deduplication');
    check(await indexedCache());
    const alternate = 'https://example.com/article?b=3&a=1';
    const alternateExpected = lookupClipsForUrl(buildClipIndex(normalizeClips([...clips].sort(compare))), alternate);
    assert(JSON.stringify(await pageCache.getByUrl(alternate, readCanonicalRows)) === JSON.stringify(alternateExpected), 'Page cache lost alternate-query priority');
    for (const method of methods) for (const state of ['cold', 'warm'] as const) {
      const clear = () => { cache.clear(); pageCache.clear(); };
      const prepare = state === 'cold' ? clear : () => {};
      const operation = method === 'full-cache' ? full : method === 'key-scan' ? keyScan : method === 'canonical-index' ? canonicalIndex : indexedCache;
      prepare(); check(await operation());
      const samplesMs = [];
      const iterations = (method === 'full-cache' || method === 'indexed-cache') && state === 'warm'
        ? Math.max(1, Math.min(1000, Math.floor(20000 / expected.length))) : 1;
      for (let i = 0; i < 7; i++) {
        prepare();
        const start = performance.now();
        let found: Clip[] = [];
        for (let j = 0; j < iterations; j++) found = await operation();
        samplesMs.push((performance.now() - start) / iterations);
        check(found);
      }
      results.push({ records, distribution, matches: expected.length, method, state, iterations, medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs });
      if (state === 'cold') {
        let allocationResult: Clip[] | null = null;
        allocations.push({ records, name: `${distribution}-${method}`,
          prepare: async () => {
            allocationResult = null;
            clear();
            if (allocationFixture !== clips) { await seed(); allocationFixture = clips; }
          },
          operation: async () => { allocationResult = await operation(); },
          verify: () => { check(allocationResult!); allocationResult = null; }
        });
      }
    }
  }
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'url-read', experimental: true, methods, results };
  (window as any).__performanceCleanup = () => { database.close(); indexedDBManager.close(); };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
