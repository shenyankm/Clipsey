// 原型只缓存有界主键，正文与版本始终在当前事务中读取。
import { IndexedDB, indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
type Pages = { revision: string; pages: Map<string, { keys: string[]; weight: number }>; weight: number };
const snapshots = new WeakMap<IDBDatabase, Pages>();
async function prototype(page: number, options: QueryOptions) {
  const offset = (page - 1) * 20, direction = options.direction as 'next' | 'prev';
  if (offset < 256 || options.query !== undefined) return IndexedDBQuery.paginate('clips', page, 20, options);
  return indexedDBManager.executeTransaction(['clips', 'metadata'], 'readonly', async transaction => {
    const store = transaction.objectStore('clips'), source = options.indexName ? store.index(options.indexName) : store;
    const revision = (await read(transaction.objectStore('metadata').get(CLIP_REVISION_KEY)))?.value;
    let saved = snapshots.get(transaction.db);
    if (typeof revision !== 'string' || saved?.revision !== revision) { snapshots.delete(transaction.db); saved = undefined; }
    // 复用同一个事务计数器；这是实验夹具访问，未添加生产公开 API。
    const counting: Promise<number> = (IndexedDBQuery as any).readCount(transaction, 'clips', options.indexName, options.query);
    const tag = JSON.stringify([options.indexName ?? '', direction, offset, 20]);
    const cached = saved?.pages.get(tag);
    const keys = cached?.keys ?? await new Promise<IDBValidKey[]>((resolve, reject) => {
      const keys: IDBValidKey[] = []; let skipped = false;
      const request = source.openKeyCursor(options.query, direction);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(keys); return; }
        if (!skipped) { skipped = true; cursor.advance(offset); return; }
        keys.push(cursor.primaryKey);
        if (keys.length === 20) resolve(keys); else cursor.continue();
      };
    });
    const data = (await Promise.all(keys.map(key => read(store.get(key))))).map(value => IndexedDB.readRecord(store, value)) as Clip[];
    const total = await counting;
    if (typeof revision === 'string' && keys.every(key => typeof key === 'string')) {
      const strings = keys as string[], weight = 128 + strings.reduce((sum, key) => sum + key.length * 2 + 32, 0);
      if (weight <= 256 * 1024) {
        const complete = transaction.oncomplete;
        transaction.oncomplete = function(event) {
          try {
            const previous = snapshots.get(transaction.db);
            const next: Pages = previous?.revision === revision ? previous : { revision, pages: new Map(), weight: 0 };
            const old = next.pages.get(tag); if (old) next.weight -= old.weight;
            next.pages.delete(tag); next.pages.set(tag, { keys: strings, weight }); next.weight += weight;
            // shortcut: 原型最多 16 页/256 KiB 字段权重；不是实际堆上限，生产采用前另测收益。
            while (next.pages.size > 16 || next.weight > 256 * 1024) {
              const first = next.pages.keys().next().value!; next.weight -= next.pages.get(first)!.weight; next.pages.delete(first);
            }
            snapshots.set(transaction.db, next);
          } finally { complete?.call(this, event); }
        };
      }
    }
    return { data, total, page, pageSize: 20, totalPages: Math.ceil(total / 20) };
  });
}

try {
  const reverse = new URLSearchParams(location.search).has('reverse'), results = [];
  for (const records of reverse ? [10000, 100] : [100, 10000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`, sourceUrl: `https://example.com/article/${i % 100}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
    }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const sources: (string | undefined)[] = [undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id'];
    if (reverse) sources.reverse();
    const scenarios = [];
    for (const indexName of sources) for (const direction of reverse ? ['prev', 'next'] as const : ['next', 'prev'] as const) {
      const options = { indexName, direction }, expected = await IndexedDBQuery.getAll('clips', options);
      const page = records === 100 ? 5 : 451, expectedPage = JSON.stringify(expected.slice((page - 1) * 20, page * 20));
      const samples = { current: [] as number[], prototype: [] as number[] }, cold = { current: [] as number[], prototype: [] as number[] };
      async function run(method: 'current' | 'prototype') {
        const start = performance.now(), result = method === 'current' ? await IndexedDBQuery.paginate('clips', page, 20, options) : await prototype(page, options);
        assert(result.total === records && JSON.stringify(result.data) === expectedPage, 'Page order, count or fields changed');
        return performance.now() - start;
      }
      const order = reverse ? ['prototype', 'current'] as const : ['current', 'prototype'] as const;
      for (let i = 0; i < 7; i++) {
        for (const method of i % 2 ? order.toReversed() : order) {
          indexedDBManager.close(); await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          cold[method].push(await run(method)); samples[method].push(await run(method));
        }
      }
      const extra = { ...clips[0]!, id: 'mutation' }; await indexedDBManager.put('clips', extra);
      const changed = await IndexedDBQuery.getAll('clips', options), changedPage = JSON.stringify(changed.slice((page - 1) * 20, page * 20));
      const refreshed = await prototype(page, options); assert(refreshed.total === records + 1 && JSON.stringify(refreshed.data) === changedPage, 'Write invalidation failed');
      await indexedDBManager.delete('clips', extra.id);
      scenarios.push({ indexName: indexName ?? null, direction, page, cold, samples,
        medians: Object.fromEntries(Object.entries(samples).map(([method, values]) => [method, values.toSorted((a,b) => a-b)[3]])), writeInvalidation: true });
    }
    results.push({ records, scenarios });
  }
  (window as any).__performanceResult = { scenario: 'page-keys', userAgent: navigator.userAgent, reverse, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
finally { indexedDBManager.close(); }
