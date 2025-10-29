import { describe, it, expect, vi } from 'vitest';

// Mock handlers
vi.mock('@/background/handlers/save-clip', () => ({
  handleSaveClip: vi.fn(async () => {})
}));
vi.mock('@/background/handlers/request-clips', () => ({
  handleRequestClips: vi.fn(async () => [{ id: 'x', sourceUrl: 'https://a', textContent: 't', createdAt: new Date().toISOString() }])
}));
vi.mock('@/background/handlers/clear-clips', () => ({
  handleClearClips: vi.fn(async () => {})
}));
vi.mock('@/background/handlers/open-clip', () => ({
  handleOpenClip: vi.fn(async () => {})
}));

// Import after mocks
import { registerMessageRouter } from '@/background/handlers/message-router';
import { handleSaveClip } from '@/background/handlers/save-clip';
import { handleRequestClips } from '@/background/handlers/request-clips';
import { handleClearClips } from '@/background/handlers/clear-clips';
import { handleOpenClip } from '@/background/handlers/open-clip';

describe('Message Router', () => {
  it('routes messages to respective handlers', async () => {
    const listeners: any[] = [];
    // Override addListener to capture callback
    const original = chrome.runtime.onMessage.addListener;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chrome.runtime.onMessage.addListener as any) = (cb: any) => { listeners.push(cb); };

    registerMessageRouter();
    expect(listeners.length).toBeGreaterThan(0);
    const cb = listeners[0];

    // SAVE_CLIP
    await new Promise<void>(resolve => {
      cb({ type: 'SAVE_CLIP', payload: { textContent: 't' } }, null, (res: any) => {
        expect(res.success).toBe(true);
        resolve();
      });
    });
    expect((handleSaveClip as any).mock.calls.length).toBeGreaterThan(0);

    // REQUEST_CLIPS
    await new Promise<void>(resolve => {
      cb({ type: 'REQUEST_CLIPS' }, null, (res: any) => {
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);
        resolve();
      });
    });
    expect((handleRequestClips as any).mock.calls.length).toBeGreaterThan(0);

    // CLEAR_CLIPS
    await new Promise<void>(resolve => {
      cb({ type: 'CLEAR_CLIPS' }, null, (res: any) => {
        expect(res.success).toBe(true);
        resolve();
      });
    });
    expect((handleClearClips as any).mock.calls.length).toBeGreaterThan(0);

    // OPEN_CLIP
    await new Promise<void>(resolve => {
      cb({ type: 'OPEN_CLIP', payload: { id: 'x' } }, null, (res: any) => {
        expect(res.success).toBe(true);
        resolve();
      });
    });
    expect((handleOpenClip as any).mock.calls.length).toBeGreaterThan(0);

    // Restore addListener
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chrome.runtime.onMessage.addListener as any) = original as any;
  });
});