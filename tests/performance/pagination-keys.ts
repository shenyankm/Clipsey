// 实验：三种分页读取使用同一真实数据库；正文、顺序和精确总数逐次核对。
import { IndexedDB, indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import type { Clip } from '../../src/types/clip';
import type { QueryOptions } from '../../src/types/indexeddb';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Experimental read failed'));
});
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];

try {
  const reverse = new URLSearchParams(location.search).has('reverse');
  const methods = ['current', 'bulk-keys', 'key-cursor'] as const;
  const order = reverse ? methods.toReversed() : [...methods];
  const results = [];
  for (const records of reverse ? [10000, 100] : [100, 10000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 100}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
    }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const sources: QueryOptions[] = [
      {}, { indexName: 'createdAt' }, { indexName: 'sourceUrl' }, { indexName: 'textContent' },
      { indexName: 'createdAt_id', query: IDBKeyRange.bound([clips[Math.floor(records / 5)]!.createdAt, ''], [clips[Math.floor(records * 0.8)]!.createdAt, []]) }
    ];
    if (reverse) sources.reverse();
    const scenarios = [];
    for (const sourceOptions of sources) for (const direction of reverse ? ['prev', 'next'] as const : ['next', 'prev'] as const) {
      const options = { ...sourceOptions, direction };
      const expected = await IndexedDBQuery.getAll('clips', options);
      const pages = [1, 2, 14, Math.floor(expected.length / 40) + 1, Math.floor(expected.length * 0.9 / 20) + 1, Math.ceil(expected.length / 20), Math.ceil(expected.length / 20) + 1];
      if (reverse) pages.reverse();
      for (const page of pages) {
        const offset = (page - 1) * 20;
        const expectedPage = JSON.stringify(expected.slice(offset, offset + 20));
        const samples = Object.fromEntries(methods.map(method => [method, [] as { countMs: number; readMs: number; totalMs: number; keyCount?: number; cursorEvents?: number; eligible: boolean }[]]));
        async function run(method: typeof methods[number]) {
          const start = performance.now();
          const total = await IndexedDBQuery.count('clips', options.indexName, options.query);
          const counted = performance.now();
          const eligible = offset >= 256 && offset <= 10000;
          let keyCount: number | undefined, cursorEvents: number | undefined;
          const data = method === 'current' || !eligible
            ? await IndexedDBQuery.getAll('clips', { ...options, offset, limit: 20 })
            : await indexedDBManager.executeTransaction('clips', 'readonly', async transaction => {
              const store = transaction.objectStore('clips');
              const source = options.indexName ? store.index(options.indexName) : store;
              let keys: IDBValidKey[];
              if (method === 'bulk-keys') {
                // shortcut: 原型只验收查询最多 10000 个命中；生产接入需在超限时保留原游标。
                keys = await read(source.getAllKeys(options.query, 10001));
                keyCount = keys.length;
                assert(keys.length <= 10000, 'Prototype exceeded its bounded key window');
                if (direction === 'prev') keys.reverse();
                keys = keys.slice(offset, offset + 20);
              } else {
                cursorEvents = 0;
                keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
                  const selected: IDBValidKey[] = [];
                  const request = source.openKeyCursor(options.query, direction);
                  let skipped = false;
                  request.onerror = () => reject(request.error ?? new Error('Key cursor failed'));
                  request.onsuccess = () => {
                    cursorEvents! += 1;
                    const cursor = request.result;
                    if (!cursor) { resolve(selected); return; }
                    if (!skipped) { skipped = true; cursor.advance(offset); return; }
                    selected.push(cursor.primaryKey);
                    if (selected.length === 20) resolve(selected);
                    else cursor.continue();
                  };
                });
                keyCount = keys.length;
              }
              return Promise.all(keys.map(async key => IndexedDB.readRecord(store, await read(store.get(key))) as Clip));
            });
          const fetched = performance.now();
          assert(total === expected.length, 'Wrong exact count');
          assert(JSON.stringify(data) === expectedPage, 'Wrong order/full fields/private-field isolation');
          return { countMs: counted - start, readMs: fetched - counted, totalMs: performance.now() - start, keyCount, cursorEvents, eligible };
        }
        for (const method of order) await run(method);
        for (let i = 0; i < 7; i++) for (const method of [...order.slice(i % order.length), ...order.slice(0, i % order.length)]) samples[method]!.push(await run(method));
        scenarios.push({ indexName: options.indexName ?? null, boundedRange: !!options.query, direction, page, offset, total: expected.length,
          methods: Object.fromEntries(methods.map(method => [method, { countMedianMs: median(samples[method]!.map(x => x.countMs)), readMedianMs: median(samples[method]!.map(x => x.readMs)), totalMedianMs: median(samples[method]!.map(x => x.totalMs)), samples: samples[method] }])) });
      }
    }
    results.push({ records, scenarios });
  }
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'pagination-keys', reverse, results };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
} finally { indexedDBManager.close(); }
