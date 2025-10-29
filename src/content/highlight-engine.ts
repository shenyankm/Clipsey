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

const INLINE_CLASS = 'clipsey-inline-highlight';
const INLINE_COLOR = 'rgba(251, 191, 36, 0.45)';

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
  span.style.backgroundColor = INLINE_COLOR;
  span.style.borderRadius = '2px';
  span.style.padding = '0 1px';
  range.surroundContents(span);
  return [span];
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
    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const tasks = highlights.map(async (h) => {
      if (signal.aborted) return false;
      const text = h.textContent?.trim();
      if (!text) return false;
      const range = h.textOffset && typeof h.textOffset === 'number'
        ? this.createRangeFromDocumentOffset(h.textOffset, text.length)
        : findTextRangeInNode(document.body, text);
      if (!range) return false;
      const spans = applyInline(range);
      const id = h.highlightId ?? h.id ?? text;
      this.activeSpans.set(id, spans);
      await this.sleep(this.throttled);
      return true;
    });

    const results = await Promise.all(tasks);
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
}