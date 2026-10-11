import type { Clip } from '../../src/types/clip';

// 只替代扩展消息传输；下方导入的存储、事务和同步逻辑仍使用真实源码。
(globalThis as any).chrome = { runtime: {
  onMessage: { addListener() {}, removeListener() {} },
  sendMessage: () => Promise.resolve()
} };

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function measure(prepare: () => Promise<unknown>, operation: () => Promise<unknown>) {
  await prepare();
  await operation();
  const samplesMs: number[] = [];
  for (let i = 0; i < 7; i++) {
    await prepare();
    const start = performance.now();
    await operation();
    samplesMs.push(performance.now() - start);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs };
}

try {
  const { indexedDBManager } = await import('../../src/background/indexeddb');
  const { IndexedDBQuery } = await import('../../src/background/indexeddb-query');
  const { addClip, deleteClip, saveClips } = await import('../../src/background/storage');
  const { syncManager } = await import('../../src/background/storage/sync-manager');
  const results = [];
  for (const records of [100, 10000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i), highlightId: `highlight-${i}`, textContent: 'Performance fixture '.repeat(32),
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i % 1000}`,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString()
    }));
    await IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 });
    const target = { ...clips[0], id: 'new', highlightId: 'new-highlight' };
    const add = await measure(() => indexedDBManager.delete('clips', target.id), () => addClip(target));
    assert(await indexedDBManager.count('clips') === records + 1, 'Add lost records');
    const replace = await measure(async () => {
      await indexedDBManager.delete('clips', 'replacement');
      await indexedDBManager.put('clips', target);
    }, () => addClip({ ...target, id: 'replacement' }));
    assert(await indexedDBManager.count('clips') === records + 1, 'Highlight replacement lost records');
    assert(!await indexedDBManager.get('clips', 'new'), 'Highlight duplicate survived');
    const remove = await measure(() => indexedDBManager.put('clips', target), () => deleteClip(target.id));
    assert(!await indexedDBManager.get('clips', target.id), 'Deletion failed');
    assert(await indexedDBManager.count('clips') === records + 1, 'Deletion lost unrelated records');
    const clear = await measure(() => IndexedDBQuery.bulkPut('clips', clips, { batchSize: 1000 }), () => saveClips([]));
    assert(await indexedDBManager.count('clips') === 0, 'Clear failed');
    results.push({ records, add, replace, remove, clear });
  }
  syncManager.close();
  indexedDBManager.close();
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'writes', results };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
