import { IndexedDB, indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { searchService, type SearchQuery } from '../../src/background/services/search-service';
import { CLIP_REVISION_KEY, STORE_CONFIGS, type TransactionMode } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];
const projectionStore = 'searchProjectionProbe';
const project = (clip: Clip) => ({ id: clip.id, title: clip.title, textContent: clip.textContent, sourceUrl: clip.sourceUrl, createdAt: clip.createdAt });
const getAll = IDBObjectStore.prototype.getAll;
const put = IDBObjectStore.prototype.put;
const remove = IDBObjectStore.prototype.delete;
const clear = IDBObjectStore.prototype.clear;
const execute = IndexedDB.prototype.executeTransaction;
let projection = false;
let largestRead = 0;
let scanReads = 0;

try {
  // 仅为隔离夹具加 store；生产配置文件和迁移代码不变。
  STORE_CONFIGS.push({ name: projectionStore, keyPath: 'id', indexes: [] });
  IndexedDB.prototype.executeTransaction = (function(this: IndexedDB, names: string | string[], mode: TransactionMode, operation: (tx: IDBTransaction) => Promise<unknown>) {
    const stores = typeof names === 'string' ? [names] : names;
    return execute.call(this, projection && stores.includes('clips') ? [...new Set([...stores, projectionStore])] : stores, mode, operation);
  }) as typeof execute;
  IDBObjectStore.prototype.getAll = function(...args) {
    if (this.name === 'clips') scanReads += 1;
    const source = projection && this.name === 'clips' ? this.transaction.objectStore(projectionStore) : this;
    const request = getAll.apply(source, args);
    request.addEventListener('success', () => { largestRead = Math.max(largestRead, request.result.length); });
    return request;
  };
  IDBObjectStore.prototype.put = function(value, key?) {
    const request = put.call(this, value, key);
    if (projection && this.name === 'clips') put.call(this.transaction.objectStore(projectionStore), project(value));
    return request;
  };
  IDBObjectStore.prototype.delete = function(key) {
    const request = remove.call(this, key);
    if (projection && this.name === 'clips') remove.call(this.transaction.objectStore(projectionStore), key);
    return request;
  };
  IDBObjectStore.prototype.clear = function() {
    const request = clear.call(this);
    if (projection && this.name === 'clips') clear.call(this.transaction.objectStore(projectionStore));
    return request;
  };
  const reverse = new URLSearchParams(location.search).has('reverse');
  const results = [];
  async function reset() {
    await indexedDBManager.executeTransaction(['clips', projectionStore], 'readwrite', async tx => {
      clear.call(tx.objectStore('clips')); clear.call(tx.objectStore(projectionStore));
    });
  }
  async function verifyProjection() {
    await indexedDBManager.executeTransaction(['clips', projectionStore], 'readonly', async tx => {
      const read = (store: string) => new Promise<Clip[]>((resolve, reject) => {
        const request = getAll.call(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const [full, projected] = await Promise.all([read('clips'), read(projectionStore)]);
      assert(JSON.stringify(full.map(project)) === JSON.stringify(projected), 'Projection differs from stored fields');
    });
  }
  for (const records of reverse ? [10000, 100] : [100, 10000]) {
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 100}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
    }));
    const queries: SearchQuery[] = [
      { type: 'content', keyword: 'NEEDLE', sortBy: 'createdAt', sortOrder: 'desc', page: Math.max(1, records / 100) },
      { type: 'website', keyword: '/article/1', sortBy: 'sourceUrl', sortOrder: 'asc', page: 1 },
      { type: 'all', keyword: '测试', sortBy: 'textContent', sortOrder: 'asc', page: 2 },
      { type: 'content', keyword: 'absent', sortBy: 'createdAt', sortOrder: 'asc', page: 1 },
      { type: 'all', keyword: 'needle', sortBy: 'title', sortOrder: 'asc', page: 2 },
      { type: 'all', keyword: '', sortBy: 'title', sortOrder: 'desc', page: Math.max(1, records / 100) }
    ];
    projection = true;
    await reset(); await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 }); await verifyProjection();
    // 禁用新快照，只测完整记录与持久化投影的实际扫描；只影响临时夹具数据库。
    await indexedDBManager.delete('metadata', CLIP_REVISION_KEY);
    for (const mode of reverse ? ['projection', 'full'] : ['full', 'projection']) {
      projection = mode === 'projection';
      const scenarios = [];
      for (const query of reverse ? [...queries].reverse() : queries) {
        const fields: (keyof Clip)[] = query.type === 'content' ? ['textContent'] : query.type === 'website' ? ['sourceUrl'] : ['title', 'sourceUrl', 'textContent'];
        const expected = clips.filter(clip => fields.some(field => String(clip[field] ?? '').toLowerCase().includes(query.keyword!.toLowerCase())));
        const direction = query.sortOrder === 'asc' ? 1 : -1; const sortBy = query.sortBy!;
        expected.sort((a, b) => direction * (sortBy === 'title'
          ? (a.title ?? '').localeCompare(b.title ?? '') || a.id.localeCompare(b.id)
          : indexedDB.cmp(a[sortBy]!, b[sortBy]!) || indexedDB.cmp(a.id, b.id)));
        const page = expected.slice((query.page! - 1) * 20, query.page! * 20);
        const run = async () => {
          const result = await searchService.search(query);
          assert(result.total === expected.length, 'Wrong count');
          assert(JSON.stringify(result.items) === JSON.stringify(page), 'Wrong order, fields or HTML hydration');
        };
        largestRead = 0; scanReads = 0; await run(); const samplesMs = [];
        for (let i = 0; i < 7; i++) { const start = performance.now(); await run(); samplesMs.push(performance.now() - start); }
        assert(largestRead <= 256, 'Unbounded scan');
        assert(scanReads === 8 * (Math.floor(records / 256) + 1), 'Memory snapshot bypassed the projection scan');
        scenarios.push({ query, total: expected.length, largestRead, scanReads, medianMs: median(samplesMs), samplesMs });
      }
      results.push({ records, mode, scenarios });
    }
    for (const mode of reverse ? ['projection', 'full'] : ['full', 'projection']) {
      projection = mode === 'projection'; const samplesMs = [];
      for (let i = -1; i < 7; i++) {
        await reset(); const start = performance.now(); await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
        if (i >= 0) samplesMs.push(performance.now() - start);
        if (projection) await verifyProjection();
      }
      results.push({ records, mode, bulkPut: { medianMs: median(samplesMs), samplesMs } });
    }
    projection = true;
    await reset(); await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    await indexedDBManager.put('clips', { ...clips[0]!, title: 'Updated', textContent: 'unique update' });
    await verifyProjection();
    const update = await searchService.search({ type: 'content', keyword: 'unique update', sortBy: 'title' });
    assert(update.total === 1 && update.items[0]?.id === clips[0]!.id && update.items[0]?.htmlContent === clips[0]!.htmlContent, 'Upsert/hydration failed');
    await indexedDBManager.delete('clips', clips[0]!.id); await verifyProjection();
    assert((await searchService.search({ keyword: 'unique update', sortBy: 'title' })).total === 0, 'Stale deletion');
    await indexedDBManager.clear('clips'); await verifyProjection();
  }
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'search-projection', reverse, experimentalStore: projectionStore, results, consistencyChecksPassed: true };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
} finally {
  IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.put = put;
  IDBObjectStore.prototype.delete = remove; IDBObjectStore.prototype.clear = clear;
  IndexedDB.prototype.executeTransaction = execute; indexedDBManager.close();
  const index = STORE_CONFIGS.findIndex(store => store.name === projectionStore);
  if (index >= 0) STORE_CONFIGS.splice(index, 1);
}
