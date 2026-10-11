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
  storage: {}
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

  it('lists clips after native text-fragment navigation and saves a canonical source URL', async () => {
    await handleSaveClip({ textContent: 'quoted text', sourceUrl: 'https://example.com/article#:~:text=quoted%20text' });
    const result = await getClipsByUrlPaged({
      url: 'https://example.com/article#:~:text=quoted%20text', page: 1, pageSize: 20
    });
    expect(result.total).toBe(1);
    expect(result.items[0].sourceUrl).toBe('https://example.com/article');
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
