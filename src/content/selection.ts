import type { Clip } from '@/types/clip';

declare global {
  interface Window {
    __PAGE_CLIPPER_CONTENT_INITIALIZED__?: boolean;
    find(
      string: string,
      caseSensitive?: boolean,
      backwards?: boolean,
      wrapAround?: boolean,
      wholeWord?: boolean,
      searchInFrames?: boolean,
      showDialog?: boolean
    ): boolean;
  }
}

if (!window.__PAGE_CLIPPER_CONTENT_INITIALIZED__) {
  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'REQUEST_SELECTION': {
        const selection = window.getSelection();
        const textContent = selection?.toString().trim();

        if (!textContent) {
          sendResponse({ success: false, error: 'No selection' });
          return;
        }

        const payload: Partial<Clip> = {
          textContent,
          htmlContent: extractSelectionHtml(selection),
          sourceUrl: window.location.href,
          title: document.title
        };

        sendMessage({ type: 'SAVE_CLIP', payload })
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error?.message }));

        return true;
      }
      case 'HIGHLIGHT_CLIP':
        highlightClip(message?.payload)
          .then(success => sendResponse({ success }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      default:
        break;
    }

    return undefined;
  });
}

function extractSelectionHtml(selection: Selection | null): string | undefined {
  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i += 1) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }

  // Using innerHTML keeps original markup where possible.
  return container.innerHTML || undefined;
}

async function highlightClip(
  payload: { textContent?: string } | undefined
): Promise<boolean> {
  const textContent = payload?.textContent?.trim();
  if (!textContent) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  const queries = buildHighlightQueries(textContent);
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (const query of queries) {
      if (!query) {
        continue;
      }

      if (highlightWithWindowFind(selection, query)) {
        return true;
      }

      if (highlightWithDomSearch(selection, query)) {
        return true;
      }
    }

    await delay(300);
  }

  return false;
}

function highlightWithWindowFind(selection: Selection, query: string): boolean {
  if (typeof window.find !== 'function') {
    return false;
  }

  selection.removeAllRanges();

  const found = window.find(query, false, false, true, false, false, false);
  if (!found || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const rect = getFirstVisibleRect(range);
  if (!rect) {
    return false;
  }

  centerOnRect(rect);
  return true;
}

function highlightWithDomSearch(selection: Selection, query: string): boolean {
  if (!document.body) {
    return false;
  }

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return false;
  }

  const lowerQuery = normalizedQuery.toLowerCase();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node?.parentElement) {
        return NodeFilter.FILTER_SKIP;
      }

      const parent = node.parentElement;
      if (parent.closest('script, style, noscript, svg, canvas')) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.textContent;
      if (!text || !text.trim()) {
        return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current: Node | null = walker.nextNode();
  while (current) {
    const text = current.textContent;
    if (text) {
      const lower = text.toLowerCase();
      const startIndex = lower.indexOf(lowerQuery);
      if (startIndex !== -1) {
        const range = document.createRange();
        range.setStart(current, startIndex);
        range.setEnd(current, startIndex + normalizedQuery.length);
        selection.removeAllRanges();
        selection.addRange(range);

        const rect = getFirstVisibleRect(range);
        if (!rect) {
          return false;
        }

        centerOnRect(rect);
        return true;
      }
    }

    current = walker.nextNode();
  }

  return false;
}

function buildHighlightQueries(textContent: string): string[] {
  const trimmed = textContent.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const queries = new Set<string>();

  queries.add(trimmed);
  queries.add(normalized);

  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length >= 6) {
      queries.add(line);
    }
  }

  if (normalized.length > 140) {
    queries.add(normalized.slice(0, 140));
    queries.add(normalized.slice(-140));
  }

  const words = normalized.split(' ').filter(Boolean);
  if (words.length > 12) {
    queries.add(words.slice(0, 12).join(' '));
    queries.add(words.slice(-12).join(' '));
  }

  return Array.from(queries).filter(query => query.length >= 4);
}

function getFirstVisibleRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  for (const rect of Array.from(rects)) {
    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return rect;
}

function centerOnRect(rect: DOMRect): void {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const targetTop = rect.top + window.scrollY - viewportHeight / 2 + rect.height / 2;

  window.scrollTo({
    top: targetTop < 0 ? 0 : targetTop,
    behavior: 'smooth'
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}
