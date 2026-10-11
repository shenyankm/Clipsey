import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOpenClip } from '@/background/handlers/open-clip';
import { clipService } from '@/background/services/clip-service';
import { contentScriptService } from '@/background/services/content-script-service';

const tabs = vi.hoisted(() => ({
  query: vi.fn(), update: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({}),
  onUpdated: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn().mockReturnValue(false) }
}));
vi.mock('wxt/browser', () => ({ browser: { tabs } }));
vi.mock('@/background/services/clip-service', () => ({ clipService: { listAll: vi.fn() } }));
vi.mock('@/background/services/content-script-service', () => ({
  contentScriptService: {
    sendMessageToTab: vi.fn().mockResolvedValue({ success: true }),
    injectContentScript: vi.fn(), isMissingReceiverError: vi.fn()
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/article' }]);
  vi.mocked(clipService.listAll).mockResolvedValue([{
    id: 'clip', sourceUrl: 'https://example.com/article', textContent: 'quoted text', createdAt: '2025-01-01'
  }]);
});
afterEach(() => vi.useRealTimers());

describe('open clip', () => {
  it('uses native navigation without injection or retry listeners when supported', async () => {
    await handleOpenClip('clip', true);
    expect(tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com/article#:~:text=quoted%20text' });
    expect(tabs.onUpdated.addListener).not.toHaveBeenCalled();
    expect(contentScriptService.sendMessageToTab).not.toHaveBeenCalled();
    expect(contentScriptService.injectContentScript).not.toHaveBeenCalled();
  });

  it('retains content-script focus for browsers without native support', async () => {
    await handleOpenClip('clip', false);
    await vi.waitFor(() => expect(contentScriptService.sendMessageToTab).toHaveBeenCalledWith(1, expect.objectContaining({
      type: 'FOCUS_CLIP'
    })));
    expect(tabs.update).not.toHaveBeenCalled();
  });

  it('does not treat different query parameters as the same page in the fallback', async () => {
    vi.useFakeTimers();
    tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/article?page=2' }]);
    await handleOpenClip('clip', false);
    expect(tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com/article' });
    expect(contentScriptService.sendMessageToTab).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
  });

  it('does not navigate for a missing clip', async () => {
    await expect(handleOpenClip('missing', true)).rejects.toThrow('未找到剪辑');
    expect(tabs.update).not.toHaveBeenCalled();
  });
});
