// 诊断冷查询：单独记录原生请求时间，不用于正式提速百分比。
import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
type Trace = { request: string; startMs: number; finishMs?: number };
const count = IDBIndex.prototype.count, get = IDBObjectStore.prototype.get, openCursor = IDBIndex.prototype.openCursor;
let tracing: { start: number; events: Trace[] } | undefined;
function watch(request: IDBRequest, kind: string) {
  if (!tracing) return;
  const event: Trace = { request: kind, startMs: performance.now() - tracing.start };
  const active = tracing;
  active.events.push(event);
  request.addEventListener('success', () => { event.finishMs = performance.now() - active.start; }, { once: true });
}
IDBIndex.prototype.count = function(query) {
  const request = count.call(this, query); watch(request, `${this.name}.count`); return request;
};
IDBObjectStore.prototype.get = function(key) {
  const request = get.call(this, key);
  if (this.name === 'metadata' && key === CLIP_REVISION_KEY) watch(request, 'revision.get');
  return request;
};
IDBIndex.prototype.openCursor = function(query, direction) {
  const request = openCursor.call(this, query, direction);
  const active = tracing;
  if (active) {
    const startMs = performance.now() - active.start;
    request.addEventListener('success', () => active.events.push({ request: request.result ? 'cursor.row' : 'cursor.end', startMs, finishMs: performance.now() - active.start }));
  }
  return request;
};
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Native diagnostic failed'));
});

try {
  const reverse = new URLSearchParams(location.search).has('reverse');
  const clips: Clip[] = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i % 100}` : undefined,
    textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`,
    htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
    sourceUrl: `https://example.com/article/${i % 100}`,
    createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString()
  }));
  const methods = ['native-count', 'query-count', 'page-6'] as const;
  const order = reverse ? methods.toReversed() : [...methods];
  const results = [];
  for (const transition of reverse ? ['shrink', 'fresh'] : ['fresh', 'shrink']) {
    for (const indexName of reverse ? ['createdAt', 'textContent'] : ['textContent', 'createdAt']) {
      const trials = [];
      for (let i = 0; i < 7; i++) {
        indexedDBManager.close();
        await read(indexedDB.deleteDatabase('ClipseyDB'));
        if (transition === 'shrink') {
          await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
          await indexedDBManager.clear('clips');
        }
        await IndexedDBQuery.bulkPut('clips', clips.slice(0, 100), { batchSize: 1000 });
        assert((await IndexedDBQuery.getAll('clips', { indexName, direction: 'prev' })).length === 100, 'Preparation mismatch');
        const samples = [];
        for (const method of [...order.slice(i % 3), ...order.slice(0, i % 3)]) {
          indexedDBManager.close();
          await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          async function run(phase: string) {
            const start = performance.now();
            tracing = { start, events: [] };
            if (method === 'native-count') {
              assert(await indexedDBManager.executeTransaction('clips', 'readonly', transaction => read(transaction.objectStore('clips').index(indexName).count())) === 100, 'Native count mismatch');
            } else if (method === 'query-count') {
              assert(await IndexedDBQuery.count('clips', indexName) === 100, 'Query count mismatch');
            } else {
              const result = await IndexedDBQuery.paginate('clips', 6, 20, { indexName, direction: 'prev' });
              assert(result.total === 100 && result.totalPages === 5 && result.data.length === 0, 'Empty page mismatch');
            }
            const totalMs = performance.now() - start, events = tracing.events;
            tracing = undefined;
            return { phase, totalMs, events };
          }
          samples.push({ method, cold: await run('cold'), warm: await run('warm') });
        }
        trials.push({ iteration: i, samples });
      }
      results.push({ transition, indexName, trials });
    }
  }
  await indexedDBManager.clear('clips');
  let invalidDirectionRejected = false;
  try { await IndexedDBQuery.paginate('clips', 1, 20, { direction: 'invalid' } as unknown as QueryOptions); }
  catch (error) { invalidDirectionRejected = error instanceof TypeError; }
  assert(invalidDirectionRejected, 'Native invalid direction must still reject on an empty store');
  (window as any).__performanceResult = { scenario: 'count-transition', userAgent: navigator.userAgent, reverse, invalidDirectionRejected, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
finally {
  tracing = undefined; IDBIndex.prototype.count = count; IDBObjectStore.prototype.get = get; IDBIndex.prototype.openCursor = openCursor; indexedDBManager.close();
}
