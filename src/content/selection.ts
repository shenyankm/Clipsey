import type { Clip } from '@/types/clip';
import { HighlightEngine } from '@/content/highlight-engine';
import { ensureHighlightColorsReady, getInlineHighlightColor, HIGHLIGHT_INLINE_CLASS } from '@/content/color-manager';
import type { MessageResponse } from '@/types/message';
import { delay } from '@/utils/helpers';
// 注:避免在内容脚本中依赖外部 ESM 模块,内联最小错误消息提取逻辑
function getErrorMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage) return maybeMessage;
    const toString = (error as { toString?: () => string }).toString;
    if (typeof toString === 'function') {
      const s = toString();
      if (s) return s;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// 在内容脚本环境内联消息发送函数，避免打包为外部 ESM 导入
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

// 复用工具函数 delay，避免重复定义

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

type HighlightMetadata = {
  highlightId: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
};

const INLINE_HIGHLIGHT_CLASS = HIGHLIGHT_INLINE_CLASS;
const CONTEXT_RADIUS = 64;

const __engine = new HighlightEngine();

if (!window.__PAGE_CLIPPER_CONTENT_INITIALIZED__) {
  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = true;
  // 初始化时确保颜色已注入
  void ensureHighlightColorsReady();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'PING':
        // 用于检测内容脚本是否已加载
        sendResponse({ success: true } satisfies MessageResponse);
        return true;
      case 'REQUEST_SELECTION':
        return handleRequestSelection(sendResponse);
      case 'FOCUS_CLIP':
        __engine
          .focusClip(message?.payload)
          .then(success => sendResponse({ success } satisfies MessageResponse))
          .catch(error => {
            const msg = getErrorMessage(error);
            void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'FOCUS_CLIP in content script' } });
            sendResponse({ success: false, error: msg } satisfies MessageResponse);
          });
        return true;
      case 'ACTIVATE_HIGHLIGHTS': {
        const remoteHighlights = normalizeIncomingHighlights(message?.payload);
        void __engine
          .activateHighlights(remoteHighlights)
          .then(success => sendResponse({ success } satisfies MessageResponse))
          .catch(error => {
            const msg = getErrorMessage(error);
            void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'ACTIVATE_HIGHLIGHTS in content script' } });
            sendResponse({ success: false, error: msg } satisfies MessageResponse);
          });
        return true;
      }
      default:
        break;
    }

    return undefined;
  });
}

let cachedSafeAreaInsetTop: number | null = null;
let underlineContainer: HTMLDivElement | null = null;
const activeUnderlines: HTMLDivElement[] = [];
const MAX_UNDERLINES = 100; // 防止内存泄漏：限制最大数量
const UNDERLINE_ID = 'page-clipper-underline-layer';

/**
 * 提取选区的HTML内容
 * 优化:保留完整的富文本结构信息
 */
function extractSelectionHtml(selection: Selection | null): string | undefined {
  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    const clonedContent = range.cloneContents();
    container.appendChild(clonedContent);
  }

  // 使用 innerHTML 保留完整的富文本结构
  const html = container.innerHTML;
  return html && html.trim() ? html : undefined;
}

/**
 * 定位到指定的剪辑内容
 * @deprecated 该函数已被 HighlightEngine.focusClip 替代，保留供未来参考
 */
async function _focusClip(
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

    // 空白字符标记
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

/**
 * 为选区添加下划线高亮标记
 * @deprecated 该函数已被 HighlightEngine 替代，保留供未来参考
 */
function _underlineSelection(selection: Selection | null): void {
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const ranges: Range[] = [];
  for (let i = 0; i < selection.rangeCount; i += 1) {
    ranges.push(selection.getRangeAt(i).cloneRange());
  }

  underlineRanges(ranges);
}

/**
 * 为单个Range添加下划线高亮
 * 用于焦点定位时的临时高亮效果
 */

/**
 * 为单个Range添加下划线高亮
 * 用于焦点定位时的临时高亮效果
 */
function underlineRange(range: Range): void {
  underlineRanges([range.cloneRange()]);
}

/**
 * 为多个Range添加下划线高亮
 * 优化:防止内存泄漏,使用动态颜色管理
 */

function underlineRanges(ranges: Range[]): void {
  if (!ranges.length || !document.body) {
    return;
  }

  const container = ensureUnderlineContainer();
  if (!container) {
    return;
  }

  // 防止内存泄漏：如果超过最大数量，清理旧的
  if (activeUnderlines.length >= MAX_UNDERLINES) {
    clearOldestUnderlines(Math.floor(MAX_UNDERLINES / 2));
  }

  const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
  const scrollY = window.scrollY ?? window.pageYOffset ?? 0;

  for (const range of ranges) {
    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      const underline = document.createElement('div');
      underline.className = 'clipsey-highlight';
      underline.style.position = 'absolute';
      underline.style.pointerEvents = 'none';
      underline.style.left = `${rect.left + scrollX}px`;
      underline.style.top = `${rect.top + scrollY}px`;
      underline.style.width = `${rect.width}px`;
      underline.style.height = `${rect.height}px`;
      underline.style.backgroundColor = getInlineHighlightColor();
      underline.style.boxSizing = 'border-box';
      underline.style.borderRadius = '3px';
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

/**
 * 清理最旧的几个 underline，防止内存泄漏
 */
function clearOldestUnderlines(count: number): void {
  const toRemove = activeUnderlines.splice(0, count);
  for (const underline of toRemove) {
    underline?.remove();
  }
}


/**
 * 激活页面中的多个高亮标记
 * @deprecated 该函数已被 HighlightEngine.activateHighlights 替代，保留供未来参考
 */
async function _activateHighlights(highlights: RemoteHighlight[]): Promise<boolean> {
  if (!Array.isArray(highlights) || !highlights.length) {
    return false;
  }

  clearUnderlines();

  let documentCharacters: CharacterPosition[] | null = null;
  let charactersCollected = false;
  let applied = 0;

  for (const highlight of highlights) {
    const text = highlight.textContent?.trim();
    if (!text) {
      continue;
    }

    if (highlight.highlightId) {
      const existing = findExistingHighlightElement(highlight.highlightId);
      if (existing) {
        applied += 1;
        continue;
      }
    }

    let range =
      resolveRangeBySelector(highlight, text) ??
      resolveRangeByOffset(highlight, text) ??
      resolveRangeByContext(highlight, text);

    if (!range) {
      if (!charactersCollected) {
        documentCharacters = collectDocumentCharacters();
        charactersCollected = true;
      }

      if (documentCharacters) {
        range = findRangeForTextContent(text, documentCharacters);
        if (!range) {
          const queries = buildFocusQueries(text);
          for (const query of queries) {
            if (!query) {
              continue;
            }
            range = findRangeForTextContent(query, documentCharacters);
            if (range) {
              break;
            }
          }
        }
      }
    }

    if (!range) {
      continue;
    }

    if (applyInlineHighlight(range, highlight)) {
      applied += 1;
    }
  }

  return applied > 0;
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

function handleRequestSelection(
  sendResponse: (response: { success: boolean; error?: string }) => void
): boolean {
  const selection = window.getSelection();
  const textContent = selection?.toString().trim();

  if (!textContent || !selection?.rangeCount) {
    const msg = 'δѡ���κ�����';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  const activeRange = selection.getRangeAt(0);
  if (activeRange.collapsed) {
    const msg = 'δѡ���κ�����';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  const htmlContent = extractSelectionHtml(selection);
  const metadataRange = activeRange.cloneRange();
  const highlightId = generateHighlightId();
  const highlightSpan = wrapRangeInHighlight(activeRange, highlightId);

  if (!highlightSpan) {
    const msg = '�޷�Ϊѡ�������ָ���';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  selection.removeAllRanges();
  clearUnderlines();

  const metadata = captureHighlightMetadata(metadataRange, highlightSpan, highlightId);

  const payload: Partial<Clip> = {
    textContent,
    htmlContent,
    sourceUrl: window.location.href,
    title: document.title,
    highlightId,
    contextBefore: metadata?.contextBefore,
    contextAfter: metadata?.contextAfter,
    anchorSelector: metadata?.anchorSelector,
    textOffset: metadata?.textOffset,
    highlightStyle: 'inline'
  };

  sendMessage({ type: 'SAVE_CLIP', payload })
    .then(() => sendResponse({ success: true }))
    .catch(error => {
      const msg = getErrorMessage(error);
      void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'SAVE_CLIP from content script' } });
      sendResponse({ success: false, error: msg });
    });

  return true;
}

function generateHighlightId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'highlight-' + Math.random().toString(36).slice(2, 11);
}

/**
 * 创建高亮 span 元素
 * 优化:简化样式,使用CSS变量统一管理颜色
 */
function createHighlightSpanElement(highlightId: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = INLINE_HIGHLIGHT_CLASS;
  span.dataset.clipseyId = highlightId;
  span.dataset.clipsey = 'true';
  // 样式由 color-manager 的 CSS 规则统一管理
  return span;
}

type HighlightSegment = {
  node: Text;
  start: number;
  end: number;
};

/**
 * 收集需要高亮的文本节点片段
 * 优化:正确处理富文本结构,跨元素高亮
 */
function collectHighlightSegments(range: Range): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let current: Node | null = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    
    // 检查节点是否在range范围内
    if (!range.intersectsNode(textNode)) {
      current = walker.nextNode();
      continue;
    }

    // 跳过已高亮内容，避免重复包裹
    if (textNode.parentElement?.closest('[data-clipsey-id]')) {
      current = walker.nextNode();
      continue;
    }
    
    // 跳过不可见元素
    const parent = textNode.parentElement;
    if (parent) {
      try {
        const style = getComputedStyle(parent);
        if (style.visibility === 'hidden' || style.display === 'none') {
          current = walker.nextNode();
          continue;
        }
      } catch {
        // 忽略样式获取错误
      }
    }

    const content = textNode.textContent ?? '';
    if (!content.trim()) {
      current = walker.nextNode();
      continue;
    }

    const length = content.length;
    let start = 0;
    let end = length;

    if (textNode === range.startContainer) {
      start = Math.max(0, Math.min(length, range.startOffset));
    }

    if (textNode === range.endContainer) {
      end = Math.max(0, Math.min(length, range.endOffset));
    }

    if (start >= end) {
      current = walker.nextNode();
      continue;
    }

    segments.push({ node: textNode, start, end });
    current = walker.nextNode();
  }

  return segments;
}

/**
 * 应用高亮到所有收集的文本片段
 * 优化:支持富文本结构,跨元素高亮
 */
function applyHighlightSegments(range: Range, highlightId: string): HTMLSpanElement[] {
  const segments = collectHighlightSegments(range);
  const created: HTMLSpanElement[] = [];

  for (const { node, start, end } of segments) {
    // 检查节点是否还在DOM中
    if (!node.isConnected) {
      continue;
    }

    const segmentRange = document.createRange();
    segmentRange.setStart(node, start);
    segmentRange.setEnd(node, end);

    const span = createHighlightSpanElement(highlightId);
    
    // 尝试直接包裹
    try {
      segmentRange.surroundContents(span);
      created.push(span);
      continue;
    } catch {
      // 如果直接包裹失败(如跨元素),尝试提取内容后再包裹
      try {
        const fragment = segmentRange.extractContents();
        span.appendChild(fragment);
        segmentRange.insertNode(span);
        created.push(span);
      } catch {
        // 如果两种方式都失败,清理span并跳过
        span.remove();
        continue;
      }
    }
  }

  return created;
}

function wrapRangeInHighlight(range: Range | null, highlightId: string): HTMLSpanElement | null {
  if (!range || range.collapsed) {
    return null;
  }

  const spans = applyHighlightSegments(range, highlightId);
  if (spans.length > 0) {
    return spans[0];
  }

  const span = createHighlightSpanElement(highlightId);

  try {
    range.surroundContents(span);
    return span;
  } catch {
    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      return span;
    } catch {
      span.remove();
      return null;
    }
  }
}

function captureHighlightMetadata(
  range: Range | null,
  span: HTMLSpanElement | null,
  highlightId: string
): HighlightMetadata | null {
  if (!range) {
    return null;
  }

  const documentData = computeDocumentTextData(range);
  const selectionText = range.toString();
  let contextBefore: string | undefined;
  let contextAfter: string | undefined;
  let textOffset: number | undefined;

  if (documentData) {
    textOffset = documentData.offset;
    const beforeStart = Math.max(0, documentData.offset - CONTEXT_RADIUS);
    const afterStart = documentData.offset + selectionText.length;
    contextBefore = documentData.text.slice(beforeStart, documentData.offset);
    contextAfter = documentData.text.slice(afterStart, afterStart + CONTEXT_RADIUS);
  }

  const anchorSelector = buildCssPath(span?.parentElement ?? span ?? undefined);

  return {
    highlightId,
    contextBefore,
    contextAfter,
    anchorSelector,
    textOffset
  };
}

function computeDocumentTextData(range: Range | null): { offset: number; text: string } | null {
  if (!range || !document.body) {
    return null;
  }

  const walker = createTextNodeWalker();
  if (!walker) {
    return null;
  }

  let node = walker.nextNode();
  const textParts: string[] = [];
  let aggregateOffset = 0;
  let startOffset: number | null = null;

  while (node) {
    const textNode = node as Text;
    const content = textNode.textContent ?? '';
    if (textNode === range.startContainer) {
      startOffset = aggregateOffset + Math.min(range.startOffset, content.length);
    }
    textParts.push(content);
    aggregateOffset += content.length;
    node = walker.nextNode();
  }

  if (startOffset == null) {
    return null;
  }

  return {
    offset: startOffset,
    text: textParts.join('')
  };
}

function buildCssPath(element: Element | undefined): string | undefined {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return undefined;
  }

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const elementForSegment = current as Element;
    const tagName = elementForSegment.tagName.toLowerCase();

    if (!elementForSegment.parentElement || elementForSegment === document.body) {
      segments.unshift(tagName);
      break;
    }

    if (elementForSegment.id) {
      segments.unshift(tagName + '#' + elementForSegment.id);
      break;
    }

    const parent = elementForSegment.parentElement;
    if (!parent) {
      break;
    }

    const siblings = Array.from(parent.children) as Element[];
    let count = 0;
    let index = 0;
    for (let i = 0; i < siblings.length; i += 1) {
      const sibling = siblings[i];
      if (sibling.tagName === elementForSegment.tagName) {
        count += 1;
        if (sibling === elementForSegment) {
          index = count;
        }
      }
    }

    if (count > 1) {
      segments.unshift(tagName + ':nth-of-type(' + index + ')');
    } else {
      segments.unshift(tagName);
    }

    current = parent;
  }

  return segments.join(' > ');
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, match => '\\\\' + match);
}

function normalizeIncomingHighlights(payload: unknown): RemoteHighlight[] {
  let raw: unknown[] = [];

  if (payload && typeof payload === 'object') {
    const container = payload as { highlights?: unknown; texts?: unknown };
    if (Array.isArray(container.highlights)) {
      raw = container.highlights as unknown[];
    } else if (Array.isArray(container.texts)) {
      raw = container.texts as unknown[];
    }
  } else if (Array.isArray(payload)) {
    raw = payload as unknown[];
  }

  const normalized: RemoteHighlight[] = [];

  for (const item of raw) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) {
        normalized.push({ textContent: text });
      }
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const text = typeof entry.textContent === 'string' ? entry.textContent.trim() : '';
    if (!text) {
      continue;
    }

    normalized.push({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      highlightId: typeof entry.highlightId === 'string' ? entry.highlightId : undefined,
      textContent: text,
      contextBefore: typeof entry.contextBefore === 'string' ? entry.contextBefore : undefined,
      contextAfter: typeof entry.contextAfter === 'string' ? entry.contextAfter : undefined,
      anchorSelector: typeof entry.anchorSelector === 'string' ? entry.anchorSelector : undefined,
      textOffset:
        typeof entry.textOffset === 'number' && Number.isFinite(entry.textOffset)
          ? entry.textOffset
          : undefined,
      highlightStyle:
        entry.highlightStyle === 'inline' || entry.highlightStyle === 'overlay'
          ? (entry.highlightStyle as 'inline' | 'overlay')
          : undefined
    });
  }

  return normalized;
}

function findExistingHighlightElement(highlightId: string): HTMLElement | null {
  if (!highlightId) {
    return null;
  }

  const selector = '[data-clipsey-id=\"' + cssEscape(highlightId) + '\"]';
  return document.querySelector(selector) as HTMLElement | null;
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function resolveRangeBySelector(highlight: RemoteHighlight, text: string): Range | null {
  if (!highlight.anchorSelector) {
    return null;
  }

  const anchor = safeQuerySelector(highlight.anchorSelector);
  if (!anchor) {
    return null;
  }

  return findTextRangeInNode(anchor, text);
}

function resolveRangeByOffset(highlight: RemoteHighlight, text: string): Range | null {
  if (typeof highlight.textOffset !== 'number' || !Number.isFinite(highlight.textOffset)) {
    return null;
  }

  return createRangeFromDocumentOffset(highlight.textOffset, text.length);
}

function resolveRangeByContext(_highlight: RemoteHighlight, _text: string): Range | null {
  return null;
}

function createRangeFromDocumentOffset(offset: number, length: number): Range | null {
  if (!document.body || offset < 0 || length <= 0) {
    return null;
  }

  const walker = createTextNodeWalker();
  if (!walker) {
    return null;
  }

  let remaining = offset;
  let node: Node | null;
  let startNode: Text | null = null;
  let startOffset = 0;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const contentLength = textNode.textContent?.length ?? 0;
    if (remaining <= contentLength) {
      startNode = textNode;
      startOffset = Math.min(remaining, contentLength);
      break;
    }
    remaining -= contentLength;
  }

  if (!startNode) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);

  let remainingLength = length;
  let endNode: Text = startNode;
  let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
  remainingLength -= endOffset - startOffset;

  while (remainingLength > 0) {
    const nextNode = walker.nextNode() as Text | null;
    if (!nextNode) {
      break;
    }

    const textLength = nextNode.textContent?.length ?? 0;
    if (textLength === 0) {
      continue;
    }

    if (remainingLength <= textLength) {
      endNode = nextNode;
      endOffset = remainingLength;
      remainingLength = 0;
      break;
    }

    remainingLength -= textLength;
    endNode = nextNode;
    endOffset = textLength;
  }

  range.setEnd(endNode, endOffset);
  return range;
}

/**
 * 在指定根节点下查找文本范围
 * 优化:支持富文本结构,忽略空白字符差异,支持跳过已高亮内容
 */
function findTextRangeInNode(root: Node, text: string, skipHighlighted = true): Range | null {
  if (!root || !text) return null;
  const query = text.trim();
  if (!query) return null;
  
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node?.parentElement) {
        return NodeFilter.FILTER_SKIP;
      }
      // 排除脚本、样式等不可见元素
      if (node.parentElement.closest('script, style, noscript, svg, canvas')) {
        return NodeFilter.FILTER_REJECT;
      }
      const content = node.textContent;
      if (!content || !content.trim()) {
        return NodeFilter.FILTER_SKIP;
      }
      // 检查元素是否可见
      try {
        const parent = node.parentElement;
        if (parent) {
          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none') {
            return NodeFilter.FILTER_REJECT;
          }
        }
      } catch {
        // 忽略样式获取错误
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  const buffer: string[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    textNodes.push(textNode);
    buffer.push(textNode.textContent ?? '');
  }

  if (!textNodes.length) {
    return null;
  }

  const combined = buffer.join('');
  
  // 查找所有匹配位置，如果需要跳过已高亮内容，则找到第一个未高亮的位置
  let index = -1;
  let searchStartPos = 0;
  
  while (true) {
    // 先尝试精确匹配
    let foundIndex = combined.toLowerCase().indexOf(query.toLowerCase(), searchStartPos);
    
    // 如果精确匹配失败,尝试规范化后匹配(忽略多余空白)
    if (foundIndex === -1) {
      const normalizedCombined = combined.replace(/\s+/g, ' ').trim();
      const normalizedQuery = query.replace(/\s+/g, ' ').trim();
      const normalizedFoundIndex = normalizedCombined.toLowerCase().indexOf(
        normalizedQuery.toLowerCase(), 
        searchStartPos
      );
      
      if (normalizedFoundIndex !== -1) {
        // 将规范化索引映射回原始索引(简化版)
        let originalIndex = 0;
        let normalizedCount = 0;
        let inWhitespace = false;
        
        for (let i = 0; i < combined.length && normalizedCount < normalizedFoundIndex; i++) {
          const char = combined[i];
          const isWhitespace = /\s/.test(char);
          
          if (isWhitespace) {
            if (!inWhitespace) {
              normalizedCount++;
              inWhitespace = true;
            }
          } else {
            normalizedCount++;
            inWhitespace = false;
          }
          originalIndex++;
        }
        
        foundIndex = originalIndex;
      }
    }
    
    if (foundIndex === -1) break;
    
    // 检查此位置是否已被高亮
    if (skipHighlighted && isTextRangeHighlighted(textNodes, foundIndex, query.length)) {
      // 跳过此匹配，继续查找下一个
      searchStartPos = foundIndex + 1;
      continue;
    }
    
    // 找到未高亮的匹配
    index = foundIndex;
    break;
  }
  
  if (index === -1) {
    return null;
  }

  let remaining = index;
  let startNode: Text | null = null;
  let startOffset = 0;

  for (const textNode of textNodes) {
    const contentLength = textNode.textContent?.length ?? 0;
    if (remaining < contentLength) {
      startNode = textNode;
      startOffset = remaining;
      break;
    }
    remaining -= contentLength;
  }

  if (!startNode) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);

  let remainingLength = query.length;
  let currentIndex = textNodes.indexOf(startNode);
  let endNode = startNode;
  let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
  remainingLength -= endOffset - startOffset;

  while (remainingLength > 0 && currentIndex + 1 < textNodes.length) {
    currentIndex += 1;
    const nextNode = textNodes[currentIndex];
    const contentLength = nextNode.textContent?.length ?? 0;
    if (contentLength === 0) {
      continue;
    }
    if (remainingLength <= contentLength) {
      endNode = nextNode;
      endOffset = remainingLength;
      remainingLength = 0;
      break;
    }
    remainingLength -= contentLength;
    endNode = nextNode;
    endOffset = contentLength;
  }

  range.setEnd(endNode, endOffset);
  return range;
}

/**
 * 检查指定位置的文本范围是否已被高亮
 * @param textNodes 文本节点数组
 * @param startIndex 在合并文本中的起始索引
 * @param length 文本长度
 * @returns 如果该范围已被高亮则返回true
 */
function isTextRangeHighlighted(textNodes: Text[], startIndex: number, length: number): boolean {
  let remaining = startIndex;
  let checkLength = length;
  
  // 找到起始文本节点
  for (const tn of textNodes) {
    const nodeLen = tn.textContent?.length ?? 0;
    
    if (remaining < nodeLen) {
      // 从这个节点开始检查
      let currentNode: Text | null = tn;
      let nodeIndex = textNodes.indexOf(tn);
      
      while (checkLength > 0 && currentNode) {
        // 检查当前节点是否在高亮元素内
        const parent = currentNode.parentElement;
        if (parent?.closest('[data-clipsey-id]')) {
          return true; // 已被高亮
        }
        
        // 移动到下一个需要检查的节点
        const currentNodeLen = currentNode.textContent?.length ?? 0;
        const checkedInThisNode = Math.min(checkLength, currentNodeLen - remaining);
        checkLength -= checkedInThisNode;
        remaining = 0; // 后续节点从头开始检查
        
        nodeIndex++;
        currentNode = nodeIndex < textNodes.length ? textNodes[nodeIndex] : null;
      }
      
      return false; // 检查完所有相关节点，未发现高亮
    }
    
    remaining -= nodeLen;
  }
  
  return false;
}

function applyInlineHighlight(range: Range, highlight: RemoteHighlight): boolean {
  const targetId = highlight.highlightId || highlight.id || generateHighlightId();
  if (highlight.highlightId) {
    const existing = findExistingHighlightElement(highlight.highlightId);
    if (existing) {
      return true;
    }
  }

  const spans = applyHighlightSegments(range, targetId);
  if (spans.length > 0) {
    return true;
  }

  const span = createHighlightSpanElement(targetId);

  try {
    range.surroundContents(span);
    return true;
  } catch {
    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      return true;
    } catch {
      span.remove();
      return false;
    }
  }

}




