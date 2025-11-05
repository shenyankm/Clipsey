type RemoteHighlight = {
  id?: string;
  highlightId?: string;
  textContent?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
};
import {
  ensureHighlightColorsReady,
  HIGHLIGHT_INLINE_CLASS as INLINE_CLASS,
  HIGHLIGHT_OVERLAY_CLASS as OVERLAY_CLASS
} from '@/content/color-manager';

function createTextNodeWalker(root: Node = document.body): TreeWalker | null {
  if (!root) return null;
  try {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const style = getComputedStyle(parent);
        if (style && (style.visibility === 'hidden' || style.display === 'none')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
  } catch {
    return null;
  }
}

function findTextRangeInNode(root: Node, text: string): Range | null {
  const walker = createTextNodeWalker(root);
  if (!walker) return null;
  const query = text.trim();
  if (!query) return null;
  const lowerQuery = query.toLowerCase();
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      const content = current.textContent ?? '';
      const lower = content.toLowerCase();
      const start = lower.indexOf(lowerQuery);
      if (start !== -1) {
        const range = document.createRange();
        range.setStart(current, start);
        range.setEnd(current, start + query.length);
        return range;
      }
    }
    current = walker.nextNode();
  }
  return null;
}

function applyInline(range: Range): HTMLElement[] {
  const text = range.toString();
  if (!text) return [];
  const span = document.createElement('span');
  span.className = INLINE_CLASS;
  span.style.borderRadius = '2px';
  span.style.padding = '0 1px';
  range.surroundContents(span);
  return [span];
}

function applyOverlay(range: Range): HTMLElement[] {
  const rects = Array.from(range.getClientRects() || []);
  if (!rects.length) return [];
  const overlays: HTMLElement[] = [];
  for (const rect of rects) {
    const div = document.createElement('div');
    div.className = OVERLAY_CLASS;
    div.style.position = 'absolute';
    div.style.left = `${rect.left + window.scrollX}px`;
    div.style.top = `${rect.top + window.scrollY}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${Math.max(1, rect.height)}px`;
    div.style.borderRadius = '2px';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '2147483647';
    document.body.appendChild(div);
    overlays.push(div);
  }
  return overlays;
}

function scrollRangeIntoView(range: Range): void {
  try {
    const rect = range.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, rect.top + window.scrollY - 16);
    window.scrollTo({ top: y, behavior: 'smooth' });
  } catch {
    // noop
  }
}

export class HighlightEngine {
  private activeSpans: Map<string, HTMLElement[]> = new Map();
  private throttled = 16; // ms
  private abortController: AbortController | null = null;
  private lastPerf: { durationMs: number; appliedCount: number } | null = null;

  setThrottle(ms: number): void {
    this.throttled = Math.max(0, ms | 0);
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  clear(): void {
    for (const spans of this.activeSpans.values()) {
      for (const span of spans) {
        try {
          const parent = span.parentNode;
          if (!parent) continue;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        } catch {
          // ignore
        }
      }
    }
    this.activeSpans.clear();
  }

  undo(highlightId: string): boolean {
    const spans = this.activeSpans.get(highlightId);
    if (!spans) return false;
    for (const span of spans) {
      try {
        const parent = span.parentNode;
        if (!parent) continue;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      } catch {
        // ignore
      }
    }
    this.activeSpans.delete(highlightId);
    return true;
  }

  async focusClip(payload: { textContent?: string; id?: string } | undefined): Promise<boolean> {
    const text = payload?.textContent?.trim();
    if (!text) return false;
    const range = findTextRangeInNode(document.body, text);
    if (!range) return false;
    scrollRangeIntoView(range);
    return true;
  }

  async activateHighlights(highlights: RemoteHighlight[]): Promise<boolean> {
    if (!Array.isArray(highlights) || highlights.length === 0) return false;
    // 确保高亮颜色已准备好（动态从设置读取并注入CSS变量）
    await ensureHighlightColorsReady().catch(() => {});
    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    const tasks = highlights.map(async (h) => {
      if (signal.aborted) return false;
      const text = h.textContent?.trim();
      if (!text) return false;
      const root: Node = (() => {
        if (h.anchorSelector) {
          try {
            const el = document.querySelector(h.anchorSelector);
            if (el) return el;
          } catch {
            // ignore selector errors
          }
        }
        return document.body;
      })();
      const range = h.textOffset && typeof h.textOffset === 'number'
        ? this.createRangeFromDocumentOffset(h.textOffset, text.length)
        : findTextRangeInNode(root, text);
      if (!range) return false;
      const spans = (h.highlightStyle === 'overlay') ? applyOverlay(range) : applyInline(range);
      const id = h.highlightId ?? h.id ?? text;
      this.activeSpans.set(id, spans);
      await this.sleep(this.throttled);
      return true;
    });

    const results = await Promise.all(tasks);
    const end = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    this.lastPerf = { durationMs: Math.max(0, end - start), appliedCount: results.filter(Boolean).length };
    return results.some(Boolean);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createRangeFromDocumentOffset(offset: number, length: number): Range | null {
    try {
      let remaining = offset;
      const walker = createTextNodeWalker();
      if (!walker) return null;
      let current: Node | null = walker.nextNode();
      while (current) {
        if (current instanceof Text) {
          const text = current.textContent ?? '';
          const size = text.length;
          if (remaining <= size) {
            const start = remaining;
            const end = Math.min(size, start + length);
            const range = document.createRange();
            range.setStart(current, start);
            range.setEnd(current, end);
            return range;
          }
          remaining -= size;
        }
        current = walker.nextNode();
      }
      return null;
    } catch {
      return null;
    }
  }

  getLastPerfStats(): { durationMs: number; appliedCount: number } | null {
    return this.lastPerf;
  }
}