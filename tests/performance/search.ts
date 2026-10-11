import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { searchService, type SearchQuery } from '../../src/background/services/search-service';
import type { Clip } from '../../src/types/clip';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  let largestRead = 0;
  const getAll = IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll = function(...args) {
    const request = getAll.apply(this, args);
    request.addEventListener('success', () => { largestRead = Math.max(largestRead, request.result.length); });
    return request;
  };
  const results = [];
  for (const records of [100, 10000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'),
      title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 100}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
    }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const queries: SearchQuery[] = [
      { type: 'content', keyword: 'NEEDLE', sortBy: 'createdAt', sortOrder: 'desc', page: Math.max(1, records / 100) },
      { type: 'website', keyword: '/article/1', sortBy: 'sourceUrl', sortOrder: 'asc', page: 1 },
      { type: 'all', keyword: '测试', sortBy: 'textContent', sortOrder: 'asc', page: 2 },
      { type: 'content', keyword: 'absent', sortBy: 'createdAt', sortOrder: 'asc', page: 1 },
      { type: 'all', keyword: 'needle', sortBy: 'title', sortOrder: 'asc', page: 2 },
      { type: 'all', keyword: '', sortBy: 'title', sortOrder: 'desc', page: Math.max(1, records / 100) }
    ];
    const scenarios = [];
    for (const query of queries) {
      const fields = query.type === 'content' ? ['textContent'] : query.type === 'website' ? ['sourceUrl'] : ['title', 'sourceUrl', 'textContent'];
      const expected = clips.filter(clip => fields.some(field => String(clip[field as keyof Clip] ?? '').toLowerCase().includes(query.keyword!.toLowerCase())));
      const direction = query.sortOrder === 'asc' ? 1 : -1;
      const sortBy = query.sortBy!;
      expected.sort((a, b) => direction * (sortBy === 'title'
        ? (a.title ?? '').localeCompare(b.title ?? '') || a.id.localeCompare(b.id)
        : indexedDB.cmp(a[sortBy]!, b[sortBy]!) || indexedDB.cmp(a.id, b.id)));
      const page = query.page!;
      const ids = expected.slice((page - 1) * 20, page * 20).map(clip => clip.id).join();
      largestRead = 0;
      async function run() {
        const result = await searchService.search(query);
        assert(result.total === expected.length, 'Wrong exact count');
        assert(result.items.map(clip => clip.id).join() === ids, 'Wrong search page/order');
      }
      await run();
      const samplesMs = [];
      for (let i = 0; i < 7; i++) {
        const start = performance.now();
        await run();
        samplesMs.push(performance.now() - start);
      }
      scenarios.push({ query, total: expected.length, largestRead, medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs });
    }
    results.push({ records, scenarios });
  }
  indexedDBManager.close();
  IDBObjectStore.prototype.getAll = getAll;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'search', results };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
