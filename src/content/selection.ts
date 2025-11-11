import 'webextension-polyfill';
import { browser } from 'wxt/browser';
import type { Clip } from '@/types/clip';
import { HighlightEngine } from '@/content/highlight-engine';
import { ensureHighlightColorsReady, HIGHLIGHT_INLINE_CLASS, HIGHLIGHT_OVERLAY_CLASS } from '@/content/color-manager';
import { captureHighlightMetadata } from '@/content/highlight/metadata';
import type { MessageResponse } from '@/types/message';
import { ErrorHandler } from '@/utils/error-handler';
import type { SettingsOptions } from '@/utils/settings-local';
import { ScrollManager } from '@/content/highlight/scroll-manager';
import { isSupportedHttpUrl } from '@/utils/helpers';
import { sendMessage } from '@/utils/chrome';

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

const INLINE_HIGHLIGHT_CLASS = HIGHLIGHT_INLINE_CLASS;

const __engine = new HighlightEngine();
let __autoLocatePerformed = false;

if (!window.__PAGE_CLIPPER_CONTENT_INITIALIZED__) {
  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = true;
  // 初始化时确保颜色已注入
  void ensureHighlightColorsReady();

  type RuntimeMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];
  const runtimeMessageListener: RuntimeMessageListener = (message, _sender, sendResponse) => {
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
            const msg = ErrorHandler.getErrorMessage(error);
            void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'FOCUS_CLIP in content script' } });
            sendResponse({ success: false, error: msg } satisfies MessageResponse);
          });
        return true;
      case 'ACTIVATE_HIGHLIGHTS': {
        const remoteHighlights = normalizeIncomingHighlights(message?.payload);
        void __engine
          .activateHighlights(remoteHighlights)
          .then(async success => {
            sendResponse({ success } satisfies MessageResponse);
            try {
              await tryAutoLocateLastSummaryIfEnabled(success);
            } catch {
              // 忽略自动定位中的任何错误，避免影响主流程
            }
          })
          .catch(error => {
            const msg = ErrorHandler.getErrorMessage(error);
            void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'ACTIVATE_HIGHLIGHTS in content script' } });
            sendResponse({ success: false, error: msg } satisfies MessageResponse);
          });
        return true;
      }
      default:
        break;
    }

    return undefined;
  };

  browser.runtime.onMessage.addListener(runtimeMessageListener);
}

/** 提取选区 HTML：使用 Range.cloneContents + innerHTML 保留富文本结构。 */
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



function handleRequestSelection(
  sendResponse: (response: { success: boolean; error?: string }) => void
): boolean {
  // 区域限制：仅允许在 http/https 普通网页上摘抄
  const currentUrl = window.location.href;
  if (!isSupportedHttpUrl(currentUrl)) {
    const msg = '当前页面不支持摘抄，仅支持在第三方网站的 http/https 页面使用。';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }
  const selection = window.getSelection();
  const textContent = selection?.toString().trim();

  if (!textContent || !selection?.rangeCount) {
    const msg = '未选择任何内容';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  const activeRange = selection.getRangeAt(0);
  if (activeRange.collapsed) {
    const msg = '未选择任何内容';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  const htmlContent = extractSelectionHtml(selection);
  const metadataRange = activeRange.cloneRange();
  const highlightId = generateHighlightId();
  const highlightSpan = wrapRangeInHighlight(activeRange, highlightId);

  if (!highlightSpan) {
    const msg = '无法为选区添加高亮';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  selection.removeAllRanges();

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
      const msg = ErrorHandler.getErrorMessage(error);
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

/** 自动定位：高亮激活后根据设置跳转到最后一个摘要位置。 */
async function tryAutoLocateLastSummaryIfEnabled(success: boolean): Promise<void> {
  if (!success) return;
  if (__autoLocatePerformed) return;

  // 读取设置项
  let settings: SettingsOptions | undefined;
  try {
    settings = await sendMessage<SettingsOptions>({ type: 'REQUEST_SETTINGS' });
  } catch {
    // 读取失败时使用默认策略：不自动定位
    return;
  }

  if (!settings?.autoLocateFirstSummary) return;

  // 收集所有可能的摘要高亮元素（内联与覆盖）
  const inlineNodes = Array.from(document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_INLINE_CLASS}`));
  const overlayNodes = Array.from(document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_OVERLAY_CLASS}`));
  const candidates = [...inlineNodes, ...overlayNodes].filter(el => isElementVisible(el));

  if (!candidates.length) return;

  // 选择页面中位置最靠后的元素（以视口中的 top 坐标为排序依据）
  const sorted = candidates
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top);

  const last = sorted[sorted.length - 1]?.el;
  if (!last) return;

  try {
    const range = document.createRange();
    range.selectNodeContents(last);
    ScrollManager.scrollIntoView(range);
    __autoLocatePerformed = true;
  } catch {
    // 忽略滚动错误
  }
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** 创建高亮包裹元素：仅设置类名与数据属性，样式由 color-manager 管理。 */
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

/** 收集高亮文本片段：支持富文本与跨元素。 */
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

/** 应用高亮：直接包裹失败时退化为提取内容再包裹。 */
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















