import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Clip } from '@/types/clip';

// Mock services
vi.mock('@/background/services/clip-service', () => ({
  clipService: {
    listAll: vi.fn(async () => [])
  }
}));
vi.mock('@/background/services/content-script-service', () => ({
  contentScriptService: {
    sendMessageToTab: vi.fn(async () => ({ success: true })),
    injectContentScript: vi.fn(async () => true),
    isMissingReceiverError: vi.fn(() => false)
  }
}));

// Clip and content script services will be imported fresh inside each test
// handleOpenClip will be imported within each test after resetting modules

describe('handleOpenClip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.resetModules();
  });

  it('opens tab and focuses clip when ready', async () => {
    const clip: Clip = {
      id: 'c1',
      sourceUrl: 'https://example.com',
      textContent: 'hello',
      createdAt: new Date().toISOString()
    } as any;
    if (!(global as any).chrome) {
      (global as any).chrome = { tabs: { create: vi.fn(), onUpdated: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) } } } as any;
    } else {
      if (!(chrome as any).tabs) (chrome as any).tabs = { create: vi.fn(), onUpdated: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) } } as any;
      if (!(chrome.tabs as any).create) (chrome.tabs as any).create = vi.fn();
      if (!(chrome.tabs as any).onUpdated) (chrome.tabs as any).onUpdated = { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) } as any;
    }
    const createSpy = (chrome.tabs.create as any);
    (createSpy as any).mockResolvedValueOnce({ id: 99, status: 'complete' } as any);
    const { handleOpenClip } = await import('@/background/handlers/open-clip');
    const { clipService } = await import('@/background/services/clip-service');
    const { contentScriptService } = await import('@/background/services/content-script-service');
    (clipService.listAll as any).mockResolvedValueOnce([clip]);
    await handleOpenClip('c1');
    expect(createSpy).toHaveBeenCalledWith({ url: 'https://example.com' });
    // run scheduled focus timeout
    vi.runAllTimers();
    expect((contentScriptService.sendMessageToTab as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('throws when clip not found', async () => {
    const { handleOpenClip } = await import('@/background/handlers/open-clip');
    const { clipService } = await import('@/background/services/clip-service');
    (clipService.listAll as any).mockResolvedValueOnce([]);
    await expect(handleOpenClip('x')).rejects.toThrow('未找到剪辑');
  });

  it('throws when url is not supported', async () => {
    const bad: Clip = { id: 'b', sourceUrl: 'chrome://settings', textContent: 'x', createdAt: '' } as any;
    const { handleOpenClip } = await import('@/background/handlers/open-clip');
    const { clipService } = await import('@/background/services/clip-service');
    (clipService.listAll as any).mockResolvedValueOnce([bad]);
    await expect(handleOpenClip('b')).rejects.toThrow('不受支持');
  });
});