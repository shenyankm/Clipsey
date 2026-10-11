import { afterAll, describe, expect, it, vi } from 'vitest';
import { cacheManager } from '@/background/storage/cache-manager';
import { syncManager } from '@/background/storage/sync-manager';

const runtime = vi.hoisted(() => ({
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  sendMessage: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('wxt/browser', () => ({ browser: { runtime } }));

afterAll(() => syncManager.close());

describe('cross-context storage notifications', () => {
  it('invalidates the local cache on a runtime notification', () => {
    cacheManager.update([]);
    expect(cacheManager.has()).toBe(true);
    const listener = runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'CLIPS_CHANGED' });
    expect(cacheManager.has()).toBe(false);
  });

  it('invalidates the local cache on a BroadcastChannel notification', async () => {
    cacheManager.update([]);
    const channel = new BroadcastChannel('clipsey-storage-sync');
    try {
      channel.postMessage({ type: 'CLIPS_CHANGED' });
      await vi.waitFor(() => expect(cacheManager.has()).toBe(false));
    } finally {
      channel.close();
    }
  });
});
