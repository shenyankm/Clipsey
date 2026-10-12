import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];
try {
  const reverse = new URLSearchParams(location.search).has('reverse');
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
    for (const source of sources) for (const direction of reverse ? ['prev', 'next'] as const : ['next', 'prev'] as const) {
      const options = { ...source, direction };
      const expected = await IndexedDBQuery.getAll('clips', options);
      const deep = Math.floor(expected.length * 0.9 / 20) + 1;
      const pages = [...new Set([1, deep, Math.ceil(expected.length / 20) + 1])];
      if (reverse) pages.reverse();
      const measurements = [];
      async function run(page: number, rows = expected) {
        const expectedPage = JSON.stringify(rows.slice((page - 1) * 20, page * 20));
        const start = performance.now();
        const result = await IndexedDBQuery.paginate('clips', page, 20, options);
        assert(result.total === rows.length && result.totalPages === Math.ceil(rows.length / 20), 'Exact count mismatch');
        assert(JSON.stringify(result.data) === expectedPage, 'Page fields or order changed');
        return performance.now() - start;
      }
      for (const page of pages) {
        const samples: Record<string, number[]> = { cold: [], warm: [] };
        for (let i = 0; i < 7; i++) {
          indexedDBManager.close();
          // 连接建立不计入查询；不提前执行 count，也不触碰用户数据库。
          await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          samples.cold!.push(await run(page));
          samples.warm!.push(await run(page));
        }
        measurements.push({ page, offset: (page - 1) * 20, total: expected.length,
          phases: Object.fromEntries(Object.entries(samples).map(([phase, values]) => [phase, { medianMs: median(values), samples: values }])) });
      }
      const inserted: number[] = [], deleted: number[] = [];
      const extra = { ...clips[Math.floor(records / 2)]!, id: 'mutation' };
      for (let i = 0; i < 7; i++) {
        await indexedDBManager.put('clips', extra);
        const changed = await IndexedDBQuery.getAll('clips', options);
        inserted.push(await run(1, changed));
        await indexedDBManager.delete('clips', extra.id);
        deleted.push(await run(1));
      }
      scenarios.push({ indexName: options.indexName ?? null, boundedRange: !!options.query, direction, measurements,
        afterInsert: { medianMs: median(inserted), samples: inserted }, afterDelete: { medianMs: median(deleted), samples: deleted } });
    }
    results.push({ records, scenarios });
  }
  (window as any).__performanceResult = { scenario: 'pagination-count', userAgent: navigator.userAgent, reverse, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
finally { indexedDBManager.close(); }
