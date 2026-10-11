import { buildClipIndex, lookupClipsForUrl, type ClipIndex } from '../../src/background/storage/clip-index';
import { createIndexKeys } from '../../src/background/storage/utils/url-normalizer';
import type { Clip } from '../../src/types/clip';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const results = [];
  const allocations = [];
  for (const records of [100, 10000]) for (const query of [false, true]) {
    for (const distribution of ['grouped', 'interleaved', 'unique'] as const) {
      const clips: Clip[] = Array.from({ length: records }, (_, i) => {
        const page = distribution === 'grouped' ? Math.floor(i / 10) : distribution === 'interleaved' ? i % Math.max(1, records / 10) : i;
        return { id: String(i), textContent: `quote ${i}`, createdAt: '2025-01-01T00:00:00.000Z',
          sourceUrl: `https://example.com/article/${page}${query ? '?b=2&a=1&a=0' : ''}` };
      });
      const expected = new Map<string, Clip[]>();
      for (const clip of clips) for (const key of createIndexKeys(clip.sourceUrl)) {
        if (!expected.has(key)) expected.set(key, []);
        expected.get(key)!.push(clip);
      }
      let latest: ClipIndex | null = null;
      const operation = () => {
        latest = buildClipIndex(clips);
        assert(latest.size === expected.size, 'Wrong index key count');
      };
      const check = () => {
        for (const [key, bucket] of expected) {
          const actual = latest!.get(key);
          assert(actual?.length === bucket.length, 'Wrong bucket length');
          assert(actual.every((clip, i) => clip === bucket[i]), 'Wrong bucket order or identity');
        }
        const found = lookupClipsForUrl(latest!, clips[0]!.sourceUrl);
        assert(found.map(clip => clip.id).join() === expected.get(createIndexKeys(clips[0]!.sourceUrl)[0]!)!.map(clip => clip.id).join(), 'Wrong lookup');
      };
      operation(); check();
      const samplesMs = [];
      for (let i = 0; i < 7; i++) {
        latest = null;
        const start = performance.now();
        operation();
        samplesMs.push(performance.now() - start);
        check();
      }
      results.push({ records, query, distribution, medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs });
      allocations.push({ records, name: `${distribution}-${query ? 'query' : 'plain'}`, prepare: () => { latest = null; }, operation });
    }
  }
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'index', results };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
