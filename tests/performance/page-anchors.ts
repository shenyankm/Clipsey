// 实验：版本核对后用两端索引/主键定位新页，最多保存 16 页边界。
import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
type Point = { position: number; key: IDBValidKey; primaryKey: IDBValidKey };
type Page = { indexName?: string; direction: 'next' | 'prev'; points: Point[]; weight: number };
type Snapshot = { revision: string; pages: Map<string, Page>; weight: number };
const snapshots = new WeakMap<IDBDatabase, Snapshot>();
async function prototype(page: number, options: QueryOptions) {
  const offset = (page - 1) * 20, direction = options.direction as 'next' | 'prev';
  if (offset < 256 || options.query !== undefined) return IndexedDBQuery.paginate('clips', page, 20, options);
  return indexedDBManager.executeTransaction(['clips', 'metadata'], 'readonly', async transaction => {
    let revision: unknown;
    const total: number = await (IndexedDBQuery as any).readCount(transaction, 'clips', options.indexName, undefined, (value: unknown) => { revision = value; });
    let saved = snapshots.get(transaction.db);
    if (typeof revision !== 'string' || saved?.revision !== revision) { snapshots.delete(transaction.db); saved = undefined; }
    if (offset >= total) return { data: [] as Clip[], total, page, pageSize: 20, totalPages: Math.ceil(total / 20) };
    const store = transaction.objectStore('clips'), source = options.indexName ? store.index(options.indexName) : store;
    const end = Math.min(offset + 20, total) - 1;
    let anchor: Point | undefined, backwards = false, distance = offset;
    for (const entry of saved?.pages.values() ?? []) if (entry.indexName === options.indexName && entry.direction === direction) for (const point of entry.points) {
      const reverse = point.position >= end, skip = reverse ? point.position - end : offset - point.position;
      if (skip >= 0 && skip < distance) { anchor = point; backwards = reverse; distance = skip; }
    }
    const scanDirection = backwards ? direction === 'next' ? 'prev' : 'next' : direction;
    const range = anchor ? scanDirection === 'next' ? IDBKeyRange.lowerBound(anchor.key) : IDBKeyRange.upperBound(anchor.key) : undefined;
    const selected = await new Promise<Point[]>((resolve, reject) => {
      const points: Point[] = []; let aligned = !anchor, skipped = false;
      const request = source.openKeyCursor(range, scanDirection);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(points); return; }
        if (!aligned) {
          if (indexedDB.cmp(cursor.key, anchor!.key) || indexedDB.cmp(cursor.primaryKey, anchor!.primaryKey)) { cursor.continuePrimaryKey(anchor!.key, anchor!.primaryKey); return; }
          aligned = true;
        }
        if (!skipped) { skipped = true; if (distance) { cursor.advance(distance); return; } }
        points.push({ position: backwards ? end - points.length : offset + points.length, key: cursor.key, primaryKey: cursor.primaryKey });
        if (points.length === Math.min(20, total - offset)) resolve(points); else cursor.continue();
      };
    });
    if (backwards) selected.reverse();
    const keys = selected.map(point => point.primaryKey);
    const data: Clip[] = await (IndexedDBQuery as any).readKeys(store, keys);
    if (typeof revision === 'string' && selected.length) {
      const points = [selected[0]!, selected.at(-1)!], weight = 128 + JSON.stringify(points).length * 2;
      if (weight <= 256 * 1024) {
        const version = revision, tag = JSON.stringify([options.indexName ?? '', direction, offset, 20]), complete = transaction.oncomplete;
        transaction.oncomplete = function(event) {
          complete?.call(this, event);
          const existing = snapshots.get(this.db);
          if (existing && existing.revision !== version && existing !== saved) return;
          const next: Snapshot = existing?.revision === version ? existing : { revision: version, pages: new Map(), weight: 0 };
          const old = next.pages.get(tag); if (old) next.weight -= old.weight;
          next.pages.delete(tag); next.pages.set(tag, { indexName: options.indexName, direction, points, weight }); next.weight += weight;
          // shortcut: 原型只存两端边界，最多 16 页/256 KiB 字段权重；生产接入需覆盖失败与并发失效。
          while (next.pages.size > 16 || next.weight > 256 * 1024) { const first = next.pages.keys().next().value!; next.weight -= next.pages.get(first)!.weight; next.pages.delete(first); }
          snapshots.set(this.db, next);
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
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({ id: String(i).padStart(5, '0'), title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: `${i % 2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`, htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 100}`, createdAt: new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 5) * 1000).toISOString() }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const sources = [undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id']; if (reverse) sources.reverse();
    const scenarios = [];
    for (const indexName of sources) for (const direction of reverse ? ['prev', 'next'] as const : ['next', 'prev'] as const) {
      const options = { indexName, direction }, expected = await IndexedDBQuery.getAll('clips', options), seed = Math.floor(records * 0.9 / 20);
      for (const target of [seed + 1, seed - 1, Math.min(Math.ceil(records / 20), seed + 25)]) {
        const expectedPage = JSON.stringify(expected.slice((target - 1) * 20, target * 20)), samples = { current: [] as number[], prototype: [] as number[] };
        for (let i = 0; i < 7; i++) for (const method of (i % 2 === Number(reverse) ? ['current', 'prototype'] : ['prototype', 'current']) as ('current' | 'prototype')[]) {
          indexedDBManager.close(); await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          const run = method === 'current' ? (page: number) => IndexedDBQuery.paginate('clips', page, 20, options) : (page: number) => prototype(page, options);
          await run(seed);
          const start = performance.now(), result = await run(target);
          assert(result.total === records && JSON.stringify(result.data) === expectedPage, 'New page differs in count/order/fields');
          samples[method].push(performance.now() - start);
        }
        const median = (values: number[]) => values.toSorted((a,b) => a-b)[3];
        scenarios.push({ indexName: indexName ?? null, direction, seed, target, samples, medians: { current: median(samples.current), prototype: median(samples.prototype) } });
      }
      await prototype(seed, options); await indexedDBManager.delete('clips', clips[Math.floor(records / 2)]!.id);
      const changed = await IndexedDBQuery.getAll('clips', options), next = await prototype(seed + 1, options);
      assert(next.total === changed.length && JSON.stringify(next.data) === JSON.stringify(changed.slice(seed * 20, seed * 20 + 20)), 'Delete invalidation differs');
      await indexedDBManager.put('clips', clips[Math.floor(records / 2)]!);
    }
    const early = [];
    if (records === 10000) for (const indexName of [undefined, 'createdAt', 'sourceUrl', 'textContent', 'createdAt_id']) for (const direction of ['next', 'prev'] as const) {
      const options = { indexName, direction }, expected = await IndexedDBQuery.getAll('clips', options);
      for (const seed of [16, 100]) {
        const target = seed - 1, samples = { current: [] as number[], prototype: [] as number[] }, expectedPage = JSON.stringify(expected.slice((target - 1) * 20, target * 20));
        for (let i = 0; i < 7; i++) for (const method of (i % 2 === Number(reverse) ? ['current', 'prototype'] : ['prototype', 'current']) as ('current' | 'prototype')[]) {
          indexedDBManager.close(); await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          const run = method === 'current' ? (page: number) => IndexedDBQuery.paginate('clips', page, 20, options) : (page: number) => prototype(page, options);
          await run(seed); const start = performance.now(), result = await run(target);
          assert(result.total === records && JSON.stringify(result.data) === expectedPage, 'Early deep page count/order/fields differ');
          samples[method].push(performance.now() - start);
        }
        const median = (values: number[]) => values.toSorted((a,b) => a-b)[3];
        early.push({ indexName: indexName ?? null, direction, seed, target, samples, medians: { current: median(samples.current), prototype: median(samples.prototype) } });
      }
    }
    const oversized = [];
    if (records === 10000) {
      await IndexedDBQuery.bulkPut('clips', clips.map(clip => ({ ...clip, id: 'z' + clip.id })), { batchSize: 1000 });
      for (const indexName of ['createdAt', 'textContent']) for (const direction of ['next', 'prev'] as const) {
        const options = { indexName, direction }, expected = await IndexedDBQuery.getAll('clips', options);
        const samples = { current: [] as number[], prototype: [] as number[] }, expectedPage = JSON.stringify(expected.slice(18000, 18020));
        for (let i = 0; i < 7; i++) for (const method of (i % 2 === Number(reverse) ? ['current', 'prototype'] : ['prototype', 'current']) as ('current' | 'prototype')[]) {
          indexedDBManager.close(); await indexedDBManager.get('metadata', CLIP_REVISION_KEY);
          const run = method === 'current' ? (page: number) => IndexedDBQuery.paginate('clips', page, 20, options) : (page: number) => prototype(page, options);
          await run(900);
          const start = performance.now(), result = await run(901);
          assert(result.total === 20000 && JSON.stringify(result.data) === expectedPage, 'Oversized page count/order/fields differ');
          samples[method].push(performance.now() - start);
        }
        const median = (values: number[]) => values.toSorted((a,b) => a-b)[3];
        oversized.push({ records: 20000, indexName, direction, seed: 900, target: 901, samples, medians: { current: median(samples.current), prototype: median(samples.prototype) } });
      }
    }
    results.push({ records, scenarios, early, oversized, writeInvalidation: true });
  }
  (window as any).__performanceResult = { scenario: 'page-anchors', userAgent: navigator.userAgent, reverse, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
finally { indexedDBManager.close(); }
