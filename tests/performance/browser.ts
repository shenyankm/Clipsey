import { CacheManager } from '../../src/background/storage/cache-manager';
import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import type { Clip } from '../../src/types/clip';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function measure(operation: () => Promise<void>, iterations = 1) {
  await operation();
  const samples: number[] = [];
  for (let sample = 0; sample < 7; sample++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) await operation();
    samples.push((performance.now() - start) / iterations);
  }
  return { medianMs: samples.toSorted((a, b) => a - b)[3], samplesMs: samples };
}

try {
  const clips: Clip[] = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i).padStart(5, '0'),
    textContent: 'Performance fixture '.repeat(32),
    sourceUrl: `https://example.com/article/${i % 1000}`,
    createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString()
  }));
  const cache = new CacheManager();
  cache.update(clips);
  const loader = async () => clips;
  await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
  const fullLoad = await measure(async () => {
    const result = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt_id', direction: 'prev' });
    assert(result.length === 10000 && result[0].id === '09999', 'Wrong full load');
  });
  const deepQuery = await measure(async () => {
    const result = await IndexedDBQuery.getAll('clips', { indexName: 'createdAt_id', direction: 'prev', offset: 8980, limit: 20 });
    assert(result.map(clip => clip.id).join() === clips.slice(1000, 1020).reverse().map(clip => clip.id).join(), 'Wrong deep query');
  });
  const deepPage = await measure(async () => {
    const result = await IndexedDBQuery.paginate('clips', 450, 20, {
      indexName: 'createdAt_id', direction: 'prev'
    });
    assert(result.total === 10000, 'Wrong count');
    assert(result.data.map(clip => clip.id).join() === clips.slice(1000, 1020).reverse().map(clip => clip.id).join(), 'Wrong page/order');
  });
  const urlLookup = await measure(async () => {
    // 与 storage.getClipsForUrl 保持相同的缓存调用路径；放最后避免大量分配影响数据库对照。
    const matches = await cache.getByUrl('https://example.com/article/0', loader);
    assert(matches.length === 10, 'URL lookup lost records');
    assert(matches.every(clip => clip.sourceUrl === 'https://example.com/article/0'), 'URL mismatch');
  }, 1000);
  indexedDBManager.close();
  (window as any).__performanceResult = { userAgent: navigator.userAgent, records: clips.length, urlLookup, deepQuery, deepPage, fullLoad };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
