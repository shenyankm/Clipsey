import type { Clip } from '../../src/types/clip';

// 保留真实存储/同步代码，仅替代扩展消息传输。
(globalThis as any).chrome = { runtime: {
  onMessage: { addListener() {}, removeListener() {} },
  sendMessage: () => Promise.resolve()
} };

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function measure(prepare: () => Promise<unknown> | void, operation: () => Promise<unknown> | void, iterations = 1) {
  await prepare();
  await operation();
  const samplesMs = [];
  for (let i = 0; i < 7; i++) {
    await prepare();
    const start = performance.now();
    for (let j = 0; j < iterations; j++) await operation();
    samplesMs.push((performance.now() - start) / iterations);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs };
}

try {
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { IndexedDBQuery } = await import('../../src/background/indexeddb-query');
  const { getClips, getClipsForUrl } = await import('../../src/background/storage');
  const { cacheManager } = await import('../../src/background/storage/cache-manager');
  const { syncManager } = await import('../../src/background/storage/sync-manager');
  const results = [];
  const allocations = [];
  for (const records of [100, 10000]) {
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i).padStart(5, '0'), highlightId: `highlight-${i}`,
      textContent: 'Performance fixture '.repeat(32),
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 1000}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString()
    }));
    const seed = async () => {
      cacheManager.clear();
      await indexedDBManager.clear('clips');
      await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    };
    await seed();
    const coldAllOperation = async () => {
      const all = await getClips();
      assert(all.length === records && all[0]!.id === clips.at(-1)!.id, 'Wrong cached order/count');
    };
    const coldUrlOperation = async () => {
      const found = await getClipsForUrl('https://example.com/article/0');
      assert(found.length === Math.ceil(records / 1000), 'Wrong URL count');
      assert(found.every(clip => clip.sourceUrl === 'https://example.com/article/0'), 'Wrong URL');
      assert(found[0]!.id === clips[Math.floor((records - 1) / 1000) * 1000]!.id, 'Wrong URL order');
    };
    const clear = () => cacheManager.clear();
    const coldAll = await measure(clear, coldAllOperation);
    const coldUrl = await measure(clear, coldUrlOperation);
    const update = await measure(clear, () => cacheManager.update(clips));
    const warmAll = await measure(async () => { clear(); await coldAllOperation(); }, coldAllOperation);
    const warmUrl = await measure(() => {}, coldUrlOperation, 1000);
    // 计数不放进时间采样，避免计数器影响性能对照。
    const clock = Date.now;
    let clockReads = 0;
    cacheManager.clear();
    try {
      Date.now = () => { clockReads++; return clock(); };
      await coldUrlOperation();
    } finally { Date.now = clock; }
    results.push({ records, coldAll, coldUrl, update, warmAll, warmUrl, coldUrlClockReads: clockReads });
    allocations.push({ records, name: 'coldAll', prepare: seed, operation: coldAllOperation });
    allocations.push({ records, name: 'coldUrl', prepare: seed, operation: coldUrlOperation });
    allocations.push({ records, name: 'update', prepare: () => { cacheManager.clear(); }, operation: () => cacheManager.update(clips) });
  }
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'cache', results };
  (window as any).__performanceCleanup = () => { syncManager.close(); indexedDBManager.close(); };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
