// 实验：有界主键数组同时提供精确总数和页位置，不添加生产缓存或 schema。
import { IndexedDB, indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('Experimental request failed'));
});
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];
async function onePass(page: number, options: QueryOptions) {
  return indexedDBManager.executeTransaction(['clips', 'metadata'], 'readonly', async transaction => {
    const store = transaction.objectStore('clips'), source = options.indexName ? store.index(options.indexName) : store;
    const offset = (page - 1) * 20;
    const [, keys] = await Promise.all([read(transaction.objectStore('metadata').get(CLIP_REVISION_KEY)), read(source.getAllKeys(options.query, 10001))]);
    // shortcut: 只保留最多 10001 个临时主键；超限再取原生总数，窗口外保留原游标。
    const total = keys.length <= 10000 ? keys.length : await (IndexedDBQuery as any).readCount(transaction, 'clips', options.indexName, options.query) as number;
    const end = options.direction === 'prev' ? Math.max(0, total - offset) : Math.min(total, offset + 20);
    const start = options.direction === 'prev' ? Math.max(0, end - 20) : offset;
    const fieldWeight = keys.reduce<number>((sum, key) => sum + (typeof key === 'string' ? key.length * 2 + 32 : 32), 128);
    if (end > keys.length) {
      const data = await (IndexedDBQuery as any).readAll(transaction, 'clips', { ...options, offset, limit: 20 }) as Clip[];
      return { data, total, fallback: true, counted: true, keyCount: keys.length, fieldWeight };
    }
    const selected = keys.slice(start, end); if (options.direction === 'prev') selected.reverse();
    const data = (await Promise.all(selected.map(key => read(store.get(key))))).map(value => IndexedDB.readRecord(store, value)) as Clip[];
    return { data, total, fallback: false, counted: keys.length > 10000, keyCount: keys.length, fieldWeight };
  });
}

try {
  const reverse = new URLSearchParams(location.search).has('reverse'), results = [];
  for (const records of reverse ? [20000, 10001, 10000, 100] : [100, 10000, 10001, 20000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`, sourceUrl: `https://example.com/article/${i % 100}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
    }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const sources: QueryOptions[] = [{}, { indexName: 'createdAt' }, { indexName: 'sourceUrl' }, { indexName: 'textContent' },
      { indexName: 'createdAt_id', query: IDBKeyRange.bound([clips[Math.floor(records / 5)]!.createdAt, ''], [clips[Math.floor(records * 0.8)]!.createdAt, []]) }];
    if (reverse) sources.reverse();
    const scenarios = [];
    for (const source of sources) for (const direction of reverse ? ['prev', 'next'] as const : ['next', 'prev'] as const) {
      const options = { ...source, direction }, expected = await IndexedDBQuery.getAll('clips', options);
      const page = Math.floor(expected.length * 0.9 / 20) + 1, offset = (page - 1) * 20;
      const expectedPage = JSON.stringify(expected.slice(offset, offset + 20));
      const samples = { current: [] as number[], onePass: [] as number[] };
      let keyCount = 0, fieldWeight = 0, fallback = false, counted = false;
      for (let i = 0; i < 7; i++) for (const method of (i % 2 === Number(reverse) ? ['current', 'onePass'] : ['onePass', 'current']) as ('current' | 'onePass')[]) {
        indexedDBManager.close(); await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
        const start = performance.now(), result = method === 'current' ? await IndexedDBQuery.paginate('clips', page, 20, options) : await onePass(page, options);
        assert(result.total === expected.length && JSON.stringify(result.data) === expectedPage, 'Cold page count/order/full fields differ');
        samples[method].push(performance.now() - start);
        if ('fallback' in result) { keyCount = result.keyCount; fieldWeight = result.fieldWeight ?? 0; fallback = result.fallback; counted = result.counted; }
      }
      scenarios.push({ indexName: options.indexName ?? null, boundedRange: !!options.query, direction, page, offset, total: expected.length,
        keyCount, fieldWeight, fallback, counted, medians: { current: median(samples.current), onePass: median(samples.onePass) }, samples });
    }
    // 超限、更新索引、缺失索引字段和数值旧主键均核对真实原生结果。
    await indexedDBManager.put('clips', { ...clips[0]!, id: 'extra', createdAt: '2099-01-01T00:00:00Z' });
    const afterWrite = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt', direction: 'prev' });
    const after = await onePass(Math.floor(afterWrite.length * 0.9 / 20) + 1, { indexName: 'createdAt', direction: 'prev' });
    const at = Math.floor(afterWrite.length * 0.9 / 20) * 20;
    assert(after.total === afterWrite.length && JSON.stringify(after.data) === JSON.stringify(afterWrite.slice(at, at + 20)), 'Write or overflow changed result');
    assert(after.counted === (records >= 10000), 'Overflow count not observed');
    await indexedDBManager.clear('metadata');
    await indexedDBManager.put('clips', { ...clips[0]!, id: 1, createdAt: undefined } as unknown as Clip);
    const legacy = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt' });
    const checked = await onePass(1, { indexName: 'createdAt' });
    assert(checked.total === legacy.length && JSON.stringify(checked.data) === JSON.stringify(legacy.slice(0, 20)), 'Missing index field semantics changed');
    const all = await IndexedDBQuery.getAll('clips'), checkedAll = await onePass(1, {});
    assert(checkedAll.total === all.length && JSON.stringify(checkedAll.data) === JSON.stringify(all.slice(0, 20)), 'Legacy primary key changed');
    await indexedDBManager.clear('metadata');
    const native = await IndexedDBQuery.getAll('clips');
    const deep = Math.floor(native.length * 0.9 / 20) + 1, deepResult = await onePass(deep, {});
    assert(deepResult.total === native.length && JSON.stringify(deepResult.data) === JSON.stringify(native.slice((deep - 1) * 20, deep * 20)), 'Prefix-window fallback differs');
    const empty = await onePass(Math.ceil(native.length / 20) + 1, { direction: 'prev' });
    assert(empty.total === native.length && empty.data.length === 0, 'Out-of-range differs');
    results.push({ records, scenarios, writeInvalidation: true, overflowFallback: after.fallback, overflowCount: after.counted, legacyKeys: true, markerlessRead: true, emptyPage: true });
  }
  (window as any).__performanceResult = { scenario: 'pagination-one-pass', userAgent: navigator.userAgent, reverse, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
finally { indexedDBManager.close(); }
