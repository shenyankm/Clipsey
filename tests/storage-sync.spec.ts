import { afterAll, describe, expect, it, vi } from 'vitest';
import { cacheManager } from '@/background/storage/cache-manager';
import { syncManager } from '@/background/storage/sync-manager';

const runtime = vi.hoisted(() => {
  let listener: (message: unknown) => void;
  return {
    onMessage: {
      addListener: vi.fn(callback => { listener = callback; }),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
    emit: (message: unknown) => listener(message)
  };
});
vi.mock('wxt/browser', () => ({ browser: { runtime } }));

afterAll(() => syncManager.close());

describe('cross-context storage notifications', () => {
  it.each([1, -1, 0, undefined])('broadcasts the same small delta payload to pages and the runtime: %s', async countDelta => {
    const received: unknown[] = [];
    const channel = new BroadcastChannel('clipsey-storage-sync');
    channel.onmessage = event => received.push(event.data);
    try {
      syncManager.notifyChange(countDelta);
      await vi.waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toEqual({ type: 'CLIPS_CHANGED', timestamp: expect.any(Number), countDelta });
      expect(runtime.sendMessage).toHaveBeenLastCalledWith(received[0]);
    } finally {
      channel.close();
    }
  });

  it('invalidates the local cache on a runtime notification', () => {
    cacheManager.update([]);
    expect(cacheManager.has()).toBe(true);
    runtime.emit({ type: 'CLIPS_CHANGED' });
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
