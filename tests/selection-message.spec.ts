import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initSelectionContentScript } from '@/content/selection';
import { sendMessage } from '@/utils/chrome';

const runtime = vi.hoisted(() => {
  let listener: (message: unknown, sender: unknown, respond: unknown) => void;
  return {
    onMessage: {
      addListener: vi.fn(callback => { listener = callback; }),
      removeListener: vi.fn()
    },
    emit: (message: unknown, respond: unknown) => listener(message, {}, respond)
  };
});
const engine = vi.hoisted(() => ({
  activateHighlights: vi.fn().mockResolvedValue(true), undo: vi.fn(), abort: vi.fn()
}));
vi.mock('wxt/browser', () => ({ browser: { runtime } }));
vi.mock('@/content/highlight-engine', () => ({
  HighlightEngine: class {
    activateHighlights = engine.activateHighlights;
    undo = engine.undo;
    abort = engine.abort;
  }
}));
vi.mock('@/content/color-manager', () => ({
  ensureHighlightColorsReady: vi.fn().mockResolvedValue(undefined),
  HIGHLIGHT_INLINE_CLASS: 'clipsey-inline-highlight',
  HIGHLIGHT_OVERLAY_CLASS: 'clipsey-overlay-highlight'
}));
vi.mock('@/utils/chrome', () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true, data: { autoLocateFirstSummary: true } })
}));

beforeEach(() => { window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = false; });

describe('selection message integration', () => {
  it.each([false, true])('honors autoLocate=%s when restoring highlights', async autoLocate => {
    const dispose = initSelectionContentScript();
    try {
      const respond = vi.fn();
      runtime.emit({ type: 'ACTIVATE_HIGHLIGHTS', payload: { highlights: [], autoLocate } }, respond);
      await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ success: true }));
      expect(sendMessage).toHaveBeenCalledTimes(autoLocate ? 1 : 0);
    } finally {
      dispose();
    }
  });

  it('removes a deleted highlight and rejects malformed deletion messages', () => {
    const dispose = initSelectionContentScript();
    try {
      const respond = vi.fn();
      runtime.emit({ type: 'REMOVE_HIGHLIGHT', payload: { highlightId: 'deleted' } }, respond);
      expect(engine.undo).toHaveBeenCalledWith('deleted');
      expect(respond).toHaveBeenCalledWith({ success: true });
      runtime.emit({ type: 'REMOVE_HIGHLIGHT', payload: { highlightId: null } }, respond);
      expect(engine.undo).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ success: false }));
    } finally {
      dispose();
    }
  });
});
