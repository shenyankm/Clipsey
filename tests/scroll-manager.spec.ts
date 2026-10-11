import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScrollManager } from '@/content/highlight/scroll-manager';
import { detectTopObstructionHeight } from '@/content/highlight/viewport';

vi.mock('@/content/highlight/viewport', () => ({ detectTopObstructionHeight: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(500);
  vi.mocked(detectTopObstructionHeight).mockReturnValue({ detected: false, offset: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const rangeAt = (top: number) => ({ getBoundingClientRect: () => ({ top }) }) as Range;

it('scrolls to a distant absolute target without interrupting the smooth scroll', () => {
  ScrollManager.scrollIntoView(rangeAt(3000));
  vi.runAllTimers();
  expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 3484, behavior: 'smooth' });
  expect(window.scrollBy).not.toHaveBeenCalled();
});

it('accounts for a fixed header and clamps targets at the top of the page', () => {
  vi.mocked(detectTopObstructionHeight).mockReturnValue({ detected: true, offset: 80 });
  ScrollManager.scrollIntoView(rangeAt(300));
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 720, behavior: 'smooth' });
  ScrollManager.scrollIntoView(rangeAt(-600));
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
});
