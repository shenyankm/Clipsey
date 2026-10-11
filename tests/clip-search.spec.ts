import { beforeEach, expect, it, vi } from 'vitest';
import { useClipSearch } from '@/options/composables/useClipSearch';
import { searchClips } from '@/background/api';
import type { SearchResult } from '@/background/services/search-service';

vi.mock('@/background/api', () => ({ searchClips: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function pendingSearch() {
  let resolve!: (value: SearchResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SearchResult>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const result = (id: string): SearchResult => ({
  items: [{ id, textContent: id, sourceUrl: 'https://example.com', createdAt: '2026-10-11' }],
  total: 1, page: 1, pageSize: 20
});

it.each(['success', 'failure'])('ignores an obsolete search %s after a newer result', async outcome => {
  const old = pendingSearch();
  vi.mocked(searchClips).mockReturnValueOnce(old.promise).mockResolvedValueOnce(result('new'));
  const search = useClipSearch();
  search.searchQuery.value = 'old';
  const first = search.performSearch(1, 20);
  search.searchQuery.value = 'new';
  await search.performSearch(1, 20);
  if (outcome === 'success') old.resolve(result('old')); else old.reject(new Error('Old failure'));
  await first;
  expect(search.searchResults.value).toEqual(result('new').items);
  expect(search.searchTotal.value).toBe(1);
  expect(search.isSearching.value).toBe(false);
});

it('keeps loading until the newest request finishes', async () => {
  const old = pendingSearch();
  const current = pendingSearch();
  vi.mocked(searchClips).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const search = useClipSearch();
  const first = search.performSearch(1, 20);
  const second = search.performSearch(2, 20, { sortBy: 'title', sortOrder: 'asc' });
  old.resolve(result('old'));
  await first;
  expect(search.isSearching.value).toBe(true);
  current.resolve(result('current'));
  await second;
  expect(search.isSearching.value).toBe(false);
  expect(searchClips).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, sortBy: 'title', sortOrder: 'asc' }));
});

it('clearing search invalidates an outstanding request', async () => {
  const request = pendingSearch();
  vi.mocked(searchClips).mockReturnValueOnce(request.promise);
  const search = useClipSearch();
  const pending = search.performSearch(1, 20);
  search.clearSearch();
  request.resolve(result('old'));
  await pending;
  expect(search.searchResults.value).toEqual([]);
  expect(search.searchTotal.value).toBe(0);
  expect(search.isSearching.value).toBe(false);
});

it('reports a current failure and clears loading', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(searchClips).mockRejectedValueOnce(new Error('Current failure'));
  const search = useClipSearch();
  try {
    await expect(search.performSearch(1, 20)).rejects.toThrow('Current failure');
    expect(search.searchResults.value).toEqual([]);
    expect(search.isSearching.value).toBe(false);
  } finally { log.mockRestore(); }
});
