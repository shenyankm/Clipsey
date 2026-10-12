// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { saveClips } from '@/background/storage';
import { searchService } from '@/background/services/search-service';
import type { Clip } from '@/types/clip';

vi.mock('wxt/browser', () => ({ browser: {} }));
vi.mock('@/background/storage/sync-manager', () => ({ syncManager: { notifyChange: vi.fn() } }));
const clips: Clip[] = [
  { id: 'z', title: 'Zebra', textContent: 'shared', sourceUrl: 'https://z.example', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'b', title: 'Alpha', textContent: 'shared', sourceUrl: 'https://b.example', createdAt: '2026-10-02T00:00:00Z' },
  { id: 'a', title: 'Alpha', textContent: 'other', sourceUrl: 'https://a.example', createdAt: '2026-10-03T00:00:00Z' },
  { id: 'empty', textContent: 'shared', sourceUrl: 'https://empty.example', createdAt: '2026-10-04T00:00:00Z' }
];
beforeEach(() => saveClips(clips));
afterAll(() => indexedDBManager.close());

it.each([['asc', ['empty', 'a', 'b', 'z']], ['desc', ['z', 'b', 'a', 'empty']]] as const)(
  'sorts titles %s including missing titles, stable ties and pagination', async (sortOrder, expected) => {
    const first = await searchService.search({ sortBy: 'title', sortOrder, pageSize: 2, page: 1 });
    const second = await searchService.search({ sortBy: 'title', sortOrder, pageSize: 2, page: 2 });
    expect([...first.items, ...second.items].map(clip => clip.id)).toEqual(expected);
    expect(first.total).toBe(4);
    expect(second.total).toBe(4);
    expect((await searchService.search({ sortBy: 'title', page: 3, pageSize: 2 })).items).toEqual([]);
  }
);
it.each([
  ['title', 'ALPHA', ['a', 'b']], ['content', 'SHARED', ['empty', 'b', 'z']],
  ['website', 'B.EXAMPLE', ['b']], ['all', 'SHARED', ['empty', 'b', 'z']]
] as const)('filters %s before title sorting and pagination', async (type, keyword, expected) => {
  const result = await searchService.search({ type, keyword, sortBy: 'title', sortOrder: 'asc' });
  expect(result.items.map(clip => clip.id)).toEqual(expected);
  expect(result.total).toBe(expected.length);
});
it('retains indexed time sorting and keyword search for other sort columns', async () => {
  expect((await searchService.search({ sortBy: 'createdAt' })).items.map(clip => clip.id)).toEqual(['empty', 'a', 'b', 'z']);
  const result = await searchService.search({ type: 'content', keyword: 'shared', sortBy: 'sourceUrl', sortOrder: 'asc' });
  expect(result.items.map(clip => clip.id)).toEqual(['b', 'empty', 'z']);
});
