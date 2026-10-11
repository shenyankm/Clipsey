import { beforeEach, expect, it, vi } from 'vitest';
import { initSelectionContentScript } from '@/content/selection';
import { sendMessage } from '@/utils/chrome';
import { ScrollManager } from '@/content/highlight/scroll-manager';

const runtime = vi.hoisted(() => {
  let listener: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void;
  return {
    onMessage: { addListener: vi.fn(callback => { listener = callback; }), removeListener: vi.fn() },
    emit: (message: unknown) => new Promise<any>(resolve => listener(message, {}, resolve))
  };
});
vi.mock('wxt/browser', () => ({ browser: { runtime } }));
vi.mock('@/content/color-manager', () => ({
  ensureHighlightColorsReady: vi.fn().mockResolvedValue(undefined),
  HIGHLIGHT_INLINE_CLASS: 'clipsey-inline-highlight', HIGHLIGHT_OVERLAY_CLASS: 'clipsey-overlay-highlight'
}));
vi.mock('@/utils/chrome', () => ({ sendMessage: vi.fn() }));
vi.mock('@/content/highlight/scroll-manager', () => ({ ScrollManager: { scrollIntoView: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = false;
  document.body.innerHTML = '';
  window.getSelection()!.removeAllRanges();
  vi.mocked(sendMessage).mockResolvedValue({ success: true, data: { autoLocateFirstSummary: true } });
});

function select(start: Text, startOffset: number, end = start, endOffset = startOffset + 6) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  window.getSelection()!.addRange(range);
}

function savedPayload() {
  return vi.mocked(sendMessage).mock.calls.find(([message]) => (message as any).type === 'SAVE_CLIP')![0] as any;
}

it.each([
  ['prefix target suffix', 7, 13],
  ['prefix  target  suffix', 7, 15]
])('captures context before wrapping and accounts for trimmed whitespace: %s', async (text, start, end) => {
  document.body.innerHTML = `<p>${text}</p>`;
  select(document.querySelector('p')!.firstChild as Text, start, undefined, end);
  const dispose = initSelectionContentScript();
  try {
    expect(await runtime.emit({ type: 'REQUEST_SELECTION' })).toEqual({ success: true });
    const payload = savedPayload().payload;
    expect(payload.textContent).toBe('target');
    expect(payload.textOffset).toBe(text.indexOf('target'));
    expect(payload.contextBefore).toBe(text.slice(0, text.indexOf('target')));
    expect(payload.contextAfter).toBe(text.slice(text.indexOf('target') + 6));
    expect(document.querySelector(payload.anchorSelector)).not.toBeNull();
  } finally { dispose(); }
});

it('preserves cross-element selection metadata and original markup', async () => {
  document.body.innerHTML = '<p>prefix <b>tar</b><i>get</i> suffix</p>';
  select(document.querySelector('b')!.firstChild as Text, 0, document.querySelector('i')!.firstChild as Text, 3);
  const dispose = initSelectionContentScript();
  try {
    await runtime.emit({ type: 'REQUEST_SELECTION' });
    expect(savedPayload().payload).toMatchObject({ textContent: 'target', textOffset: 7,
      contextBefore: 'prefix ', contextAfter: ' suffix' });
    expect(document.querySelector('b')!.textContent).toBe('tar');
    expect(document.querySelector('i')!.textContent).toBe('get');
  } finally { dispose(); }
});

it.each(['response', 'exception'])('undoes only the current highlight on a save %s failure', async failure => {
  document.body.innerHTML = '<p><span data-clipsey="true" data-clipsey-id="existing">saved</span> prefix target suffix</p>';
  select(document.querySelector('p')!.lastChild as Text, 8);
  vi.mocked(sendMessage).mockImplementation(async message => {
    if ((message as any).type === 'SAVE_CLIP') {
      if (failure === 'exception') throw new Error('Quota exceeded');
      return { success: false, error: 'Quota exceeded' };
    }
    return { success: true };
  });
  const dispose = initSelectionContentScript();
  try {
    expect(await runtime.emit({ type: 'REQUEST_SELECTION' })).toMatchObject({ success: false });
    expect(document.querySelectorAll('[data-clipsey-id]')).toHaveLength(1);
    expect(document.querySelector('[data-clipsey-id="existing"]')).not.toBeNull();
    expect(document.querySelector('p')!.textContent).toBe('saved prefix target suffix');
  } finally { dispose(); }
});

it('auto-locates the newest available highlight rather than the lowest one', async () => {
  document.body.innerHTML = '<p>NEW</p><p style="margin-top:1000px">OLD</p>';
  const dispose = initSelectionContentScript();
  try {
    await runtime.emit({ type: 'ACTIVATE_HIGHLIGHTS', payload: { highlights: [
      { highlightId: 'new', textContent: 'NEW' }, { highlightId: 'old', textContent: 'OLD' }
    ] } });
    await vi.waitFor(() => expect(ScrollManager.scrollIntoView).toHaveBeenCalled());
    expect(vi.mocked(ScrollManager.scrollIntoView).mock.calls[0][0].toString()).toBe('NEW');
  } finally { dispose(); }
});

it('auto-location falls back to an older available quote and runs only once', async () => {
  document.body.innerHTML = '<p>OLD</p>';
  const dispose = initSelectionContentScript();
  const message = { type: 'ACTIVATE_HIGHLIGHTS', payload: { highlights: [
    { highlightId: 'new', textContent: 'MISSING' }, { highlightId: 'old', textContent: 'OLD' }
  ] } };
  try {
    await runtime.emit(message);
    await vi.waitFor(() => expect(ScrollManager.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(vi.mocked(ScrollManager.scrollIntoView).mock.calls[0][0].toString()).toBe('OLD');
    await runtime.emit(message);
    expect(ScrollManager.scrollIntoView).toHaveBeenCalledTimes(1);
  } finally { dispose(); }
});
