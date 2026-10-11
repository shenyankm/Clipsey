import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tabHighlightManager } from '@/background/lifecycle/tab-highlight-manager';
import { sendHighlightsToTab } from '@/background/utils/highlight-helpers';

vi.mock('wxt/browser', () => ({ browser: {} }));
vi.mock('@/background/storage', () => ({
  getClipsForUrl: vi.fn().mockResolvedValue([{
    id: 'clip', sourceUrl: 'https://example.com/article', textContent: 'excerpt'
  }])
}));
vi.mock('@/background/utils/highlight-helpers', () => ({
  buildHighlightPayloads: vi.fn(clips => clips),
  isAutoHighlightEnabled: vi.fn().mockResolvedValue(true),
  sendHighlightsToTab: vi.fn().mockResolvedValue(true)
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('native target and automatic highlights', () => {
  it.each([
    ['https://example.com/article#:~:text=excerpt', false],
    ['https://example.com/article', true]
  ])('preserves the explicit text-fragment target for %s', async (url, autoLocate) => {
    await tabHighlightManager.handleTabUpdate(1, { status: 'complete' }, { id: 1, url });
    await vi.advanceTimersByTimeAsync(800);
    expect(sendHighlightsToTab).toHaveBeenCalledWith(1, expect.any(Array), autoLocate);
  });
});
