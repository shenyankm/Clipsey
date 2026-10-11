import { normalizeClips } from '../../src/background/storage/utils/clip-normalizer';
import type { Clip } from '../../src/types/clip';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const results = [];
  const allocations = [];
  for (const records of [100, 10000]) for (const completeDates of [false, true]) {
    const clips: Clip[] = Array.from({ length: records }, (_, i) => ({
      id: String(i), textContent: 'Performance fixture '.repeat(32),
      htmlContent: `<p>${'Rich content '.repeat(64)}</p>`, sourceUrl: `https://example.com/article/${i % 1000}`,
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: completeDates ? '2025-02-01T00:00:00.000Z' : undefined
    }));
    let latest: Clip[] | null = null;
    const operation = () => { latest = normalizeClips(clips); };
    const check = () => {
      assert(latest?.length === records, 'Wrong normalized count');
      latest.forEach((clip, i) => {
        assert(clip !== clips[i] && clip.id === clips[i]!.id, 'Wrong identity or order');
        assert(clip.createdAt === clips[i]!.createdAt, 'Changed creation date');
        assert(completeDates ? clip.updatedAt === clips[i]!.updatedAt : Number.isFinite(Date.parse(clip.updatedAt!)), 'Wrong update date');
      });
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
    const clock = Date.now;
    let clockReads = 0;
    try {
      Date.now = () => { clockReads++; return clock(); };
      operation();
    } finally { Date.now = clock; }
    check();
    results.push({ records, completeDates, medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs, explicitClockReads: clockReads });
    allocations.push({ records, name: completeDates ? 'complete-dates' : 'missing-updatedAt', prepare: () => { latest = null; }, operation });
  }
  (window as any).__cacheAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'normalize', results };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
