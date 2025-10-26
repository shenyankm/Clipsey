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

        underlineSelection(selection);

        sendMessage({ type: 'SAVE_CLIP', payload })
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error?.message }));

        return true;
      }
      case 'FOCUS_CLIP':
        focusClip(message?.payload)
          .then(success => sendResponse({ success }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      default:
        break;
    }

    return undefined;
  });
}

let cachedSafeAreaInsetTop: number | null = null;
let underlineContainer: HTMLDivElement | null = null;
const activeUnderlines: HTMLDivElement[] = [];
const UNDERLINE_THICKNESS = 2;
const UNDERLINE_COLOR = 'rgba(59, 130, 246, 0.9)';
const UNDERLINE_ID = 'page-clipper-underline-layer';

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

async function focusClip(
  payload: { textContent?: string; id?: string } | undefined
): Promise<boolean> {
  const textContent = payload?.textContent?.trim();
  if (!textContent) {
    return false;
  }

  const documentCharacters = collectDocumentCharacters();
  if (focusWithExactDomMatch(textContent, documentCharacters)) {
    return true;
  }

  const queries = buildFocusQueries(textContent);
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (const query of queries) {
      if (!query) {
        continue;
      }

      if (focusWithDomSearch(query, documentCharacters)) {
        return true;
      }

      if (focusWithWindowFind(query)) {
        return true;
      }
    }

    await delay(300);
  }

  return false;
}

function focusWithWindowFind(query: string): boolean {
  if (typeof window.find !== 'function') {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  selection.removeAllRanges();

  const found = window.find(query, false, false, true, false, false, false);
  if (!found || selection.rangeCount === 0) {
    selection.removeAllRanges();
    return false;
  }

  const range = selection.getRangeAt(0);
  const success = focusRange(range);
  selection.removeAllRanges();
  return success;
}

function focusWithDomSearch(
  query: string,
  documentCharacters: CharacterPosition[]
): boolean {
  if (!document.body) {
    return false;
  }

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return false;
  }

  if (!documentCharacters.length) {
    return legacyFocusWithDomSearch(normalizedQuery);
  }

  const range = findRangeForTextContent(normalizedQuery, documentCharacters);
  if (!range) {
    return false;
  }

  return focusRange(range);
}

function legacyFocusWithDomSearch(query: string): boolean {
  const walker = createTextNodeWalker();
  if (!walker) {
    return false;
  }

  let current: Node | null = walker.nextNode();
  const lowerQuery = query.toLowerCase();

  while (current) {
    if (current instanceof Text) {
      const text = current.textContent ?? '';
      const lower = text.toLowerCase();
      const startIndex = lower.indexOf(lowerQuery);
      if (startIndex !== -1) {
        const range = document.createRange();
        range.setStart(current, startIndex);
        range.setEnd(current, startIndex + query.length);
        return focusRange(range);
      }
    }

    current = walker.nextNode();
  }

  return false;
}

function buildFocusQueries(textContent: string): string[] {
  const trimmed = textContent.trim();
  if (!trimmed) {
    return [];
  }

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

  const containsCjk =
    /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(normalized);
  const minLength = containsCjk ? 2 : 3;
  const candidates = Array.from(queries).filter(
    query => query.length >= minLength
  );

  if (!candidates.length) {
    candidates.push(trimmed);
  }

  return candidates;
}

function getSelectionRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter(
    rect => rect.width > 0 || rect.height > 0
  );

  if (rects.length === 0) {
    const fallback = range.getBoundingClientRect();
    if (fallback.width === 0 && fallback.height === 0) {
      return null;
    }

    return fallback;
  }

  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right));
  const bottom = Math.max(...rects.map(rect => rect.bottom));

  return new DOMRect(left, top, right - left, bottom - top);
}

function scrollRectToTop(rect: DOMRect): void {
  const currentScrollY =
    window.scrollY ?? window.pageYOffset ?? document.documentElement.scrollTop ?? 0;
  const obstruction = detectTopObstructionHeight();
  const basePadding = 16;
  const unclampedTarget = rect.top + currentScrollY - obstruction.offset - basePadding;
  const targetTop = unclampedTarget < 0 ? 0 : unclampedTarget;

  window.scrollTo({
    top: targetTop,
    behavior: 'smooth'
  });

  if (!obstruction.detected) {
    scheduleFallbackScrolls(targetTop);
  }
}

function focusWithExactDomMatch(
  textContent: string,
  documentCharacters: CharacterPosition[]
): boolean {
  const range = findRangeForTextContent(textContent, documentCharacters);
  if (!range) {
    return false;
  }

  return focusRange(range);
}

function focusRange(range: Range): boolean {
  const rect = getSelectionRect(range);
  if (!rect) {
    return false;
  }

  underlineRange(range);
  scrollRectToTop(rect);
  return true;
}

type CharacterPosition = {
  node: Text;
  offset: number;
  char: string;
};

type SearchToken =
  | { type: 'char'; value: string }
  | { type: 'whitespace' };

type ObstructionDetection = {
  offset: number;
  detected: boolean;
};

function detectTopObstructionHeight(): ObstructionDetection {
  const headerHeight = measureFixedOrStickyHeaderHeight();
  const scrollPadding = getScrollPaddingTopValue();
  const safeAreaInset = getSafeAreaInsetTop();

  const rawOffset = Math.max(headerHeight, scrollPadding, safeAreaInset);
  const viewportHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
  const maxOffset = viewportHeight
    ? Math.min(viewportHeight * 0.6, 480)
    : 480;
  const offset = rawOffset > 0 ? Math.min(rawOffset, maxOffset) : 0;

  return {
    offset,
    detected: rawOffset > 0
  };
}

function measureFixedOrStickyHeaderHeight(): number {
  if (!document.body || typeof document.elementsFromPoint !== 'function') {
    return 0;
  }

  const viewportWidth =
    window.innerWidth || document.documentElement?.clientWidth || 0;
  if (viewportWidth <= 0) {
    return 0;
  }

  const sampleXs = [
    viewportWidth / 2,
    viewportWidth * 0.25,
    viewportWidth * 0.75,
    24,
    viewportWidth - 24
  ].map(value => clamp(Math.round(value), 0, Math.max(viewportWidth - 1, 0)));
  const sampleYs = [0, 12, 24, 36];

  let maxBottom = 0;

  for (const x of sampleXs) {
    for (const y of sampleYs) {
      const elements = document.elementsFromPoint(x, y);
      for (const element of elements) {
        const bottom = evaluateObstructionElement(element, y);
        if (bottom > 0) {
          if (bottom > maxBottom) {
            maxBottom = bottom;
          }
          break;
        }
      }
    }
  }

  if (maxBottom > 0) {
    return maxBottom;
  }

  return measureHeaderFromSelectors();
}

function evaluateObstructionElement(element: Element, referenceY: number): number {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  if (element === document.body || element === document.documentElement) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const position = style.position;
  if (position !== 'fixed' && position !== 'sticky') {
    return 0;
  }

  if (style.visibility === 'hidden' || style.display === 'none') {
    return 0;
  }

  if (Number.parseFloat(style.opacity) <= 0.01) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return 0;
  }

  if (rect.bottom <= referenceY) {
    return 0;
  }

  if (rect.top > 160) {
    return 0;
  }

  if (position === 'sticky') {
    const topValue = Number.parseFloat(style.top);
    if (!Number.isNaN(topValue) && topValue > 0 && rect.top > topValue + 1) {
      return 0;
    }
  }

  return rect.bottom;
}

function measureHeaderFromSelectors(): number {
  if (!document.body) {
    return 0;
  }

  const selectors = [
    'header',
    'nav',
    '[role="banner"]',
    '.navbar',
    '.site-header',
    '.global-header',
    '.top-nav',
    '.app-header'
  ];

  let maxBottom = 0;

  for (const selector of selectors) {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    let inspected = 0;

    for (const element of Array.from(candidates)) {
      if (inspected >= 5) {
        break;
      }

      const style = window.getComputedStyle(element);
      if (
        style.position !== 'fixed' &&
        style.position !== 'sticky'
      ) {
        continue;
      }

      if (style.visibility === 'hidden' || style.display === 'none') {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      if (rect.top > 160 || rect.bottom <= 0) {
        continue;
      }

      if (rect.bottom > maxBottom) {
        maxBottom = rect.bottom;
      }

      inspected += 1;
    }

    if (maxBottom > 0) {
      break;
    }
  }

  return maxBottom;
}

function getScrollPaddingTopValue(): number {
  const rootStyles = window.getComputedStyle(document.documentElement);
  const docPadding = parseCssPixels(rootStyles.scrollPaddingTop);
  const bodyPadding = document.body
    ? parseCssPixels(window.getComputedStyle(document.body).scrollPaddingTop)
    : 0;

  return Math.max(docPadding, bodyPadding);
}

function getSafeAreaInsetTop(): number {
  if (cachedSafeAreaInsetTop !== null) {
    return cachedSafeAreaInsetTop;
  }

  if (!document.body) {
    cachedSafeAreaInsetTop = 0;
    return 0;
  }

  const probe = document.createElement('div');
  probe.style.cssText =
    'position: fixed; top: 0; left: 0; width: 0; height: 0; ' +
    'padding-top: env(safe-area-inset-top); visibility: hidden; pointer-events: none;';

  document.body.appendChild(probe);
  const measured = parseCssPixels(window.getComputedStyle(probe).paddingTop);
  document.body.removeChild(probe);

  cachedSafeAreaInsetTop = measured;
  return measured;
}

function scheduleFallbackScrolls(targetTop: number): void {
  const currentScrollY =
    window.scrollY ?? window.pageYOffset ?? document.documentElement.scrollTop ?? 0;

  if (targetTop <= 0 && currentScrollY <= 0) {
    return;
  }

  const viewportHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
  const step = Math.max(80, Math.min(200, viewportHeight ? viewportHeight * 0.18 : 0));

  window.setTimeout(() => {
    smoothScrollBy(-step);
  }, 280);

  window.setTimeout(() => {
    smoothScrollBy(-step);
  }, 560);
}

function smoothScrollBy(amount: number): void {
  if (amount === 0) {
    return;
  }

  if (typeof window.scrollBy === 'function') {
    window.scrollBy({
      top: amount,
      behavior: 'smooth'
    });
    return;
  }

  const currentScrollY =
    window.scrollY ?? window.pageYOffset ?? document.documentElement.scrollTop ?? 0;
  const targetTop = currentScrollY + amount;

  window.scrollTo({
    top: targetTop < 0 ? 0 : targetTop,
    behavior: 'smooth'
  });
}

function parseCssPixels(value: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function collectDocumentCharacters(): CharacterPosition[] {
  if (!document.body) {
    return [];
  }

  const characters: CharacterPosition[] = [];
  const walker = createTextNodeWalker();
  if (!walker) {
    return characters;
  }

  let current = walker.nextNode();
  let exceededLimit = false;
  while (current) {
    if (current instanceof Text) {
      const text = current.textContent ?? '';
      for (let index = 0; index < text.length; index += 1) {
        characters.push({
          node: current,
          offset: index,
          char: text[index] ?? ''
        });

        if (characters.length >= 200000) {
          exceededLimit = true;
          break;
        }
      }
    }

    current = walker.nextNode();
    if (exceededLimit) {
      break;
    }
  }

  if (exceededLimit) {
    return [];
  }

  return characters;
}

function findRangeForTextContent(
  textContent: string,
  characters: CharacterPosition[]
): Range | null {
  if (!textContent || !characters.length) {
    return null;
  }

  const tokens = buildSearchTokens(textContent);
  if (!tokens.length) {
    return null;
  }

  const firstCharToken = tokens.find(token => token.type === 'char');
  if (!firstCharToken) {
    return null;
  }

  for (let startIndex = 0; startIndex < characters.length; startIndex += 1) {
    const candidate = characters[startIndex];
    if (isWhitespaceLike(candidate.char)) {
      continue;
    }

    if (!charsEqual(candidate.char, firstCharToken.value)) {
      continue;
    }

    const match = matchTokensAt(characters, tokens, startIndex);
    if (!match) {
      continue;
    }

    const range = document.createRange();
    range.setStart(match.start.node, match.start.offset);
    range.setEnd(match.end.node, match.end.offset + 1);
    return range;
  }

  return null;
}

function buildSearchTokens(text: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? '';
    if (isWhitespaceLike(char)) {
      while (index < text.length && isWhitespaceLike(text[index] ?? '')) {
        index += 1;
      }

      if (!tokens.length || tokens[tokens.length - 1]?.type !== 'whitespace') {
        tokens.push({ type: 'whitespace' });
      }

      continue;
    }

    tokens.push({ type: 'char', value: char });
    index += 1;
  }

  return tokens;
}

type MatchResult = {
  start: CharacterPosition;
  end: CharacterPosition;
};

function matchTokensAt(
  characters: CharacterPosition[],
  tokens: SearchToken[],
  startIndex: number
): MatchResult | null {
  let charIndex = startIndex;
  let tokenIndex = 0;
  let startPosition: CharacterPosition | null = null;
  let endPosition: CharacterPosition | null = null;

  while (tokenIndex < tokens.length) {
    if (charIndex >= characters.length) {
      const remaining = tokens.slice(tokenIndex);
      if (remaining.every(token => token.type === 'whitespace')) {
        break;
      }

      return null;
    }

    const token = tokens[tokenIndex];
    const current = characters[charIndex];

    if (token.type === 'char') {
      if (isIgnorableSpace(current.char)) {
        if (!startPosition) {
          startPosition = current;
        }
        endPosition = current;
        charIndex += 1;
        continue;
      }

      if (isWhitespaceLike(current.char)) {
        return null;
      }

      if (!charsEqual(current.char, token.value)) {
        return null;
      }

      if (!startPosition) {
        startPosition = current;
      }
      endPosition = current;
      charIndex += 1;
      tokenIndex += 1;
      continue;
    }

    // whitespace token
    while (charIndex < characters.length) {
      const whitespaceCandidate = characters[charIndex];
      if (
        isWhitespaceLike(whitespaceCandidate.char) ||
        isIgnorableSpace(whitespaceCandidate.char)
      ) {
        if (!startPosition) {
          startPosition = whitespaceCandidate;
        }
        endPosition = whitespaceCandidate;
        charIndex += 1;
        continue;
      }

      break;
    }

    tokenIndex += 1;
  }

  if (!startPosition || !endPosition) {
    return null;
  }

  return { start: startPosition, end: endPosition };
}

function underlineSelection(selection: Selection | null): void {
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const ranges: Range[] = [];
  for (let i = 0; i < selection.rangeCount; i += 1) {
    ranges.push(selection.getRangeAt(i).cloneRange());
  }

  underlineRanges(ranges);
}

function underlineRange(range: Range): void {
  underlineRanges([range.cloneRange()]);
}

function underlineRanges(ranges: Range[]): void {
  if (!ranges.length || !document.body) {
    return;
  }

  const container = ensureUnderlineContainer();
  if (!container) {
    return;
  }

  clearUnderlines();

  const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
  const scrollY = window.scrollY ?? window.pageYOffset ?? 0;

  for (const range of ranges) {
    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      const underline = document.createElement('div');
      underline.className = 'page-clipper-underline';
      underline.style.position = 'absolute';
      underline.style.pointerEvents = 'none';
      underline.style.left = `${rect.left + scrollX}px`;
      underline.style.top = `${rect.bottom + scrollY - UNDERLINE_THICKNESS}px`;
      underline.style.width = `${rect.width}px`;
      underline.style.height = '0';
      underline.style.borderBottom = `${UNDERLINE_THICKNESS}px solid ${UNDERLINE_COLOR}`;
      underline.style.boxSizing = 'border-box';
      underline.style.borderRadius = `${UNDERLINE_THICKNESS}px`;
      container.appendChild(underline);
      activeUnderlines.push(underline);
    }
  }
}

function ensureUnderlineContainer(): HTMLDivElement | null {
  if (!document.body) {
    return null;
  }

  if (underlineContainer && document.body.contains(underlineContainer)) {
    return underlineContainer;
  }

  underlineContainer = document.createElement('div');
  underlineContainer.id = UNDERLINE_ID;
  underlineContainer.style.position = 'absolute';
  underlineContainer.style.left = '0';
  underlineContainer.style.top = '0';
  underlineContainer.style.width = '0';
  underlineContainer.style.height = '0';
  underlineContainer.style.pointerEvents = 'none';
  underlineContainer.style.zIndex = '2147483647';
  underlineContainer.style.margin = '0';
  underlineContainer.style.padding = '0';
  underlineContainer.style.border = '0';

  document.body.appendChild(underlineContainer);
  return underlineContainer;
}

function clearUnderlines(): void {
  while (activeUnderlines.length) {
    const underline = activeUnderlines.pop();
    underline?.remove();
  }
}


function isWhitespaceLike(char: string): boolean {
  return /\s/.test(char);
}

function isIgnorableSpace(char: string): boolean {
  return char === '\u200B' || char === '\u200C' || char === '\u200D' || char === '\uFEFF';
}

function charsEqual(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }

  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function createTextNodeWalker(): TreeWalker | null {
  if (!document.body) {
    return null;
  }

  return document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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
