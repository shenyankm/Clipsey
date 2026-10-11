import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import { addClip, clearClips, deleteClip, getClips, getClipsForUrl, saveClips } from '@/background/storage';
import { cacheManager } from '@/background/storage/cache-manager';
import { syncManager } from '@/background/storage/sync-manager';
import { migrateClipsFromChromeStorage } from '@/background/migration';
import { exportService } from '@/background/services/export-service';
import { getClipsByUrlPaged } from '@/background/api';
import { handleSaveClip } from '@/background/handlers/save-clip';
import type { Clip } from '@/types/clip';

const local = vi.hoisted(() => ({ get: vi.fn(), remove: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { local } } }));
vi.mock('@/background/storage/sync-manager', () => ({
  syncManager: { notifyChange: vi.fn() },
}));

const clip = (id: string): Clip => ({
  id,
  textContent: `Text ${id}`,
  sourceUrl: 'https://example.com/article',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z'
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  cacheManager.clear();
  await indexedDBManager.clear('clips');
  await indexedDBManager.clear('errorLogs');
});
afterAll(() => indexedDBManager.close());

describe('clip storage transactions', () => {
  it('uses only primary keys and the highlight index for writes', async () => {
    const fullRead = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const count = vi.spyOn(IDBObjectStore.prototype, 'count');
    await saveClips([clip('old')]);
    await addClip({ ...clip('new'), highlightId: 'highlight' });
    await deleteClip('new');
    await clearClips();
    expect(fullRead).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(vi.mocked(syncManager.notifyChange).mock.calls).toEqual([[], [1], [-1], []]);
  });

  it('replaces all same-page highlight duplicates and preserves other pages', async () => {
    await saveClips([
      { ...clip('a'), highlightId: 'same' }, { ...clip('b'), highlightId: 'same' },
      { ...clip('other'), highlightId: 'same', sourceUrl: 'https://other.com' }
    ]);
    await addClip({ ...clip('new'), highlightId: 'same' });
    expect((await getClips()).map(item => item.id).sort()).toEqual(['new', 'other']);
    expect(syncManager.notifyChange).toHaveBeenLastCalledWith(-1);
    await addClip({ ...clip('new'), highlightId: 'same', textContent: 'updated' });
    expect(syncManager.notifyChange).toHaveBeenLastCalledWith(0);
    expect((await getClips()).find(item => item.id === 'new')?.textContent).toBe('updated');
  });

  it('returns the deleted record and keeps counts correct for missing IDs', async () => {
    await saveClips([clip('old')]);
    expect(await deleteClip('old')).toMatchObject(clip('old'));
    expect(syncManager.notifyChange).toHaveBeenLastCalledWith(-1);
    expect(await deleteClip('missing')).toBeUndefined();
    expect(syncManager.notifyChange).toHaveBeenLastCalledWith(0);
  });

  it('rolls back duplicate removals if the replacement cannot be written', async () => {
    const saved = { ...clip('old'), highlightId: 'same' };
    await saveClips([saved]);
    const before = await getClips();
    vi.mocked(syncManager.notifyChange).mockClear();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(addClip({ ...clip('new'), highlightId: 'same' })).rejects.toThrow('Quota exceeded');
    expect(await indexedDBManager.getAllData('clips')).toEqual(before);
    expect(await getClips()).toEqual(before);
    expect(syncManager.notifyChange).not.toHaveBeenCalled();
  });

  it('preserves the record and sends no notification when deletion fails', async () => {
    await saveClips([clip('old')]);
    vi.mocked(syncManager.notifyChange).mockClear();
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new Error('Delete failed');
    });
    await expect(deleteClip('old')).rejects.toThrow('Delete failed');
    expect(await indexedDBManager.get('clips', 'old')).toMatchObject(clip('old'));
    expect(syncManager.notifyChange).not.toHaveBeenCalled();
  });

  it('clears persisted clips with a cold cache', async () => {
    await indexedDBManager.put('clips', clip('old'));
    await clearClips();
    expect(await indexedDBManager.count('clips')).toBe(0);
    expect(await getClips()).toEqual([]);
  });

  it('replaces persisted clips with a cold cache', async () => {
    await indexedDBManager.put('clips', clip('old'));
    await saveClips([clip('new')]);
    expect((await indexedDBManager.getAllData('clips')).map(item => item.id)).toEqual(['new']);
  });

  it('keeps more than 200 clips when reading and adding', async () => {
    await saveClips(Array.from({ length: 300 }, (_, i) => clip(String(i))));
    await addClip(clip('new'));
    expect(await indexedDBManager.count('clips')).toBe(301);
    const clips = await getClips();
    expect(clips).toHaveLength(301);
    expect(clips.find(item => item.id === '0')?.updatedAt).toBe(clip('0').updatedAt);
  });

  it('rolls back replacement and sends no success notification on a write failure', async () => {
    await saveClips([clip('old')]);
    vi.mocked(syncManager.notifyChange).mockClear();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (value.id === 'bad') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.call(this, value, key);
    });

    await expect(saveClips([clip('new'), clip('bad')])).rejects.toThrow('Quota exceeded');
    expect((await indexedDBManager.getAllData('clips')).map(item => item.id)).toEqual(['old']);
    expect((await getClips()).map(item => item.id)).toEqual(['old']);
    expect(syncManager.notifyChange).not.toHaveBeenCalled();
  });

  it('rejects asynchronous batch failures instead of reporting partial success', async () => {
    await indexedDBManager.put('clips', clip('old'));
    await expect(IndexedDBQuery.bulkAdd('clips', [clip('new'), clip('old')])).rejects.toThrow();
    expect((await indexedDBManager.getAllData('clips')).map(item => item.id)).toEqual(['old']);
    await expect(IndexedDBQuery.bulkPut('clips', [{ ...clip('bad'), id: undefined } as unknown as Clip])).rejects.toThrow();
    await expect(IndexedDBQuery.bulkDelete('clips', [undefined as unknown as string])).rejects.toThrow();
  });

  it('deletes by ID without restoring records from a stale cache', async () => {
    await saveClips([clip('a'), clip('b')]);
    await getClips();
    await indexedDBManager.delete('clips', 'a');
    await deleteClip('b');
    expect(await indexedDBManager.count('clips')).toBe(0);
  });

  it('serializes concurrent additions and deletions in database transactions', async () => {
    await saveClips([clip('old')]);
    await Promise.all([addClip(clip('a')), addClip(clip('b')), deleteClip('old')]);
    expect((await getClips()).map(item => item.id).sort()).toEqual(['a', 'b']);
  });

  it('does not cache database read failures as an empty list', async () => {
    const read = vi.spyOn(IndexedDBQuery, 'getAll').mockRejectedValueOnce(new Error('Read failed'));
    await expect(getClips()).rejects.toThrow('Read failed');
    read.mockRestore();
    await indexedDBManager.put('clips', clip('old'));
    expect(await getClips()).toHaveLength(1);
  });

  it('uses the URL index without requesting full cache copies', async () => {
    await saveClips([clip('matching'), { ...clip('other'), sourceUrl: 'https://other.com' }]);
    const fullCacheRead = vi.spyOn(cacheManager, 'get');
    const databaseRead = vi.spyOn(IndexedDBQuery, 'getAll');
    const matches = await getClipsForUrl('https://example.com/article');
    expect(matches.map(item => item.id)).toEqual(['matching']);
    matches[0].textContent = 'changed';
    expect((await getClipsForUrl('https://example.com/article'))[0].textContent).toBe('Text matching');
    expect(databaseRead).toHaveBeenCalledTimes(1);
    expect(fullCacheRead).not.toHaveBeenCalled();
  });

  it('rejects malformed backups before modifying existing data', async () => {
    await saveClips([clip('old')]);
    await expect(exportService.importAll({ clips: [null as unknown as Clip] })).rejects.toThrow('invalid');
    expect((await getClips()).map(item => item.id)).toEqual(['old']);
  });

  it.each([
    { id: undefined }, { id: ' ' }, { sourceUrl: undefined }, { sourceUrl: 'javascript:alert(1)' },
    { createdAt: 'invalid' }, { textContent: ' ' }, { textOffset: -1 }, { textOffset: 1.5 },
    { title: 42 }, { updatedAt: 'invalid' }, { highlightStyle: 'unknown' }
  ])('rejects incomplete or invalid backup records: %j', async fields => {
    await saveClips([clip('old')]);
    await expect(exportService.importAll({ clips: [{ ...clip('new'), ...fields } as unknown as Clip] })).rejects.toThrow('invalid');
    expect((await getClips()).map(item => item.id)).toEqual(['old']);
  });

  it('rejects duplicate backup IDs before replacing data', async () => {
    await saveClips([clip('old')]);
    await expect(exportService.importAll({ clips: [clip('new'), clip('new')] })).rejects.toThrow('duplicate');
    expect((await getClips()).map(item => item.id)).toEqual(['old']);
  });

  it('rejects invalid error logs before replacing clips', async () => {
    await saveClips([clip('old')]);
    await expect(exportService.importAll({ clips: [clip('new')], errorLogs: {} as never })).rejects.toThrow('invalid error logs');
    expect((await getClips()).map(item => item.id)).toEqual(['old']);
  });

  it('exports a backup that round-trips rich content and highlight metadata', async () => {
    const saved = { ...clip('rich'), title: 'Title', htmlContent: '<b>Text rich</b>', highlightId: 'highlight',
      contextBefore: 'before', contextAfter: 'after', textOffset: 7, highlightStyle: 'inline' as const };
    await saveClips([saved]);
    const backup = await exportService.exportAll();
    await clearClips();
    await exportService.importAll(backup);
    expect(await getClips()).toEqual([saved]);
  });

  it('lists clips after native text-fragment navigation and saves a canonical source URL', async () => {
    await handleSaveClip({ textContent: 'quoted text', sourceUrl: 'https://example.com/article#:~:text=quoted%20text' });
    const result = await getClipsByUrlPaged({
      url: 'https://example.com/article#:~:text=quoted%20text', page: 1, pageSize: 20
    });
    expect(result.total).toBe(1);
    expect(result.items[0].sourceUrl).toBe('https://example.com/article');
  });

  it.each(['asc', 'desc'] as const)('paginates a URL by time in %s order, not by random IDs', async sortOrder => {
    await saveClips([
      { ...clip('z-old'), createdAt: '2026-10-10T00:00:00Z' },
      { ...clip('a-new'), createdAt: '2026-10-11T00:00:00Z' },
      { ...clip('other'), sourceUrl: 'https://example.com/article/other' }
    ]);
    const url = 'https://example.com/article#:~:text=quoted';
    const first = await getClipsByUrlPaged({ url, page: 1, pageSize: 1, sortOrder });
    const second = await getClipsByUrlPaged({ url, page: 2, pageSize: 1, sortOrder });
    expect([first.items[0].id, second.items[0].id]).toEqual(sortOrder === 'desc' ? ['a-new', 'z-old'] : ['z-old', 'a-new']);
    expect(first.total).toBe(2);
    expect((await getClipsByUrlPaged({ url, page: 3, pageSize: 1, sortOrder })).items).toEqual([]);
  });

  it('restores an empty backup by clearing existing clips', async () => {
    await saveClips([clip('old')]);
    await exportService.importAll({ clips: [] });
    expect(await indexedDBManager.count('clips')).toBe(0);
  });

  it('restores a backup larger than 200 clips without truncation', async () => {
    const clips = Array.from({ length: 300 }, (_, i) => clip(String(i)));
    expect(await exportService.importAll({ clips })).toEqual({ clipsImported: 300, errorLogsImported: 0 });
    expect((await exportService.exportAll()).clips).toHaveLength(300);
  });
});

describe('legacy migration', () => {
  it('migrates every clip and preserves existing IndexedDB records', async () => {
    await indexedDBManager.put('clips', clip('existing'));
    local.get.mockResolvedValue({ clips: Array.from({ length: 300 }, (_, i) => clip(String(i))) });
    expect(await migrateClipsFromChromeStorage()).toEqual({ success: true, migratedCount: 300 });
    expect(await indexedDBManager.count('clips')).toBe(301);
    expect(local.remove).toHaveBeenCalledWith('clips');
  });

  it('retains the original data when migration cannot commit', async () => {
    local.get.mockResolvedValue({ clips: [clip('legacy')] });
    vi.spyOn(IndexedDBQuery, 'bulkPut').mockRejectedValueOnce(new Error('Quota exceeded'));
    expect(await migrateClipsFromChromeStorage()).toMatchObject({ success: false, migratedCount: 0 });
    expect(local.remove).not.toHaveBeenCalled();
  });

  it('retains malformed legacy data instead of silently discarding records', async () => {
    local.get.mockResolvedValue({ clips: [clip('legacy'), null] });
    expect(await migrateClipsFromChromeStorage()).toMatchObject({ success: false });
    expect(local.remove).not.toHaveBeenCalled();
    expect(await indexedDBManager.count('clips')).toBe(0);
  });
});
