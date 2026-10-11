import { afterEach, expect, it, vi } from 'vitest';
import { buildClipIndex, lookupClipsForUrl } from '@/background/storage/clip-index';
import * as normalizer from '@/background/storage/utils/url-normalizer';
import type { Clip } from '@/types/clip';

afterEach(() => vi.restoreAllMocks());
const clip = (id: string, sourceUrl: string, highlightId?: string): Clip => ({ id, sourceUrl, highlightId, textContent: id, createdAt: '2025-01-01T00:00:00.000Z' });

it('keeps exact-query priority, bucket order, canonical paths and highlight deduplication', () => {
  const clips = [
    clip('base', 'https://example.com/article?x=2', 'shared'),
    clip('exact', 'https://example.com/article?x=1', 'shared'),
    clip('next', 'https://example.com/article?x=1', 'own'),
    clip('equivalent', 'https://example.com/article/?x=1#fragment'),
    clip('other', 'https://example.com/article?x=2', 'other')
  ];
  const index = buildClipIndex(clips);
  expect(index.get('https://example.com/article')).toEqual(clips);
  expect(index.get('https://example.com/article?x=1')).toEqual(clips.slice(1, 4));
  expect(lookupClipsForUrl(index, 'https://example.com/article?x=1').map(item => item.id)).toEqual(['exact', 'next', 'equivalent', 'other']);
  expect(lookupClipsForUrl(index, 'https://other.com/article')).toEqual([]);
});

it('reuses repeated sources, including invalid sources, and starts fresh on each build', () => {
  const parse = vi.spyOn(normalizer, 'createIndexKeys');
  const clips = [
    clip('a', 'https://example.com/a'), clip('b', 'https://example.com/a'),
    clip('invalid', 'not a URL'), clip('invalid-again', 'not a URL'),
    clip('c', 'https://example.com/b'), clip('d', 'https://example.com/a')
  ];
  const first = buildClipIndex(clips);
  expect(parse).toHaveBeenCalledTimes(3);
  expect(first.size).toBe(2);
  expect(first.get('https://example.com/a')?.map(item => item.id)).toEqual(['a', 'b', 'd']);
  buildClipIndex(clips);
  expect(parse).toHaveBeenCalledTimes(6);
  clips[0]!.sourceUrl = 'https://example.com/new';
  const next = buildClipIndex(clips);
  expect(next.get('https://example.com/new')?.map(item => item.id)).toEqual(['a']);
  expect(next.get('https://example.com/a')?.map(item => item.id)).toEqual(['b', 'd']);
});

it('skips empty and unsupported sources and preserves normalized query ordering', () => {
  const clips = [clip('a', 'https://example.com/?b=2&a=1'), clip('b', 'https://example.com/?b=2&a=1'),
    clip('empty', ''), clip('ftp', 'ftp://example.com'), clip('file', 'file:///tmp/document'),
    clip('again', 'https://example.com/?a=1&b=2')];
  const index = buildClipIndex(clips);
  expect(index.size).toBe(2);
  expect(index.get('https://example.com/?a=1&b=2')?.map(item => item.id)).toEqual(['a', 'b', 'again']);
});
