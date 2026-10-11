import { afterEach, expect, it, vi } from 'vitest';
import { normalizeClips } from '@/background/storage/utils/clip-normalizer';
import type { Clip } from '@/types/clip';

afterEach(() => vi.useRealTimers());

it('preserves supplied date strings without changing the input records', () => {
  const clips: Clip[] = [
    { id: 'saved', sourceUrl: 'https://example.com', textContent: 'quote', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'legacy', sourceUrl: '', textContent: 'legacy quote', createdAt: 'legacy string', updatedAt: '' }
  ];
  const before = structuredClone(clips);
  const normalized = normalizeClips(clips);
  expect(normalized.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))).toEqual(
    clips.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))
  );
  expect(normalized[0]).not.toBe(clips[0]);
  expect(clips).toEqual(before);
});

it('fills only missing dates with the current time and refreshes defaults on later calls', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-10-11T12:00:00.000Z');
  const clips = [
    { id: 'missing', sourceUrl: '', textContent: 'quote' },
    { id: 'partial', sourceUrl: '', textContent: 'other quote', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: null }
  ] as unknown as Clip[];
  const first = normalizeClips(clips);
  expect(first[0]).toMatchObject({ createdAt: '2026-10-11T12:00:00.000Z', updatedAt: '2026-10-11T12:00:00.000Z' });
  expect(first[1]).toMatchObject({ createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2026-10-11T12:00:00.000Z' });
  vi.setSystemTime('2026-10-11T12:00:01.000Z');
  expect(normalizeClips(clips)[0]).toMatchObject({ createdAt: '2026-10-11T12:00:01.000Z', updatedAt: '2026-10-11T12:00:01.000Z' });
  expect(clips[0].createdAt).toBeUndefined();
  expect(clips[1].updatedAt).toBeNull();
});
