import { browser } from 'wxt/browser';
import type { Clip } from '@/types/clip';
import { HighlightEngine } from '@/content/highlight-engine';
import { applyInline } from '@/content/highlight/painters';
import { ensureHighlightColorsReady, HIGHLIGHT_INLINE_CLASS } from '@/content/color-manager';
import { buildCssPath, captureHighlightMetadata } from '@/content/highlight/metadata';
import type { MessageResponse } from '@/types/message';
import { ErrorHandler } from '@/utils/error-handler';
import type { SettingsOptions } from '@/utils/settings-local';
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
type RuntimeMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];

export function initSelectionContentScript(): () => void {
  if (window.__PAGE_CLIPPER_CONTENT_INITIALIZED__) {
    return () => {};
  }

  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = true;
  __autoLocatePerformed = false;
  // 初始化时确保颜色等资源可用
  void ensureHighlightColorsReady();

  const runtimeMessageListener: RuntimeMessageListener = (message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'PING':
        // 用于检测 content script 是否已加载
        sendResponse({ success: true } satisfies MessageResponse);
        return true;
      case 'REQUEST_SELECTION':
        void handleRequestSelection(sendResponse).catch(error => {
          console.error('handleRequestSelection error:', error);
          sendResponse({
            success: false,
            error: ErrorHandler.getErrorMessage(error)
          });
        });
        return true;
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
      case 'REMOVE_HIGHLIGHT': {
        const id = message?.payload?.highlightId;
        if (typeof id !== 'string' || !id.trim()) {
          sendResponse({ success: false, error: 'Invalid highlight ID' } satisfies MessageResponse);
          return true;
        }
        __engine.undo(id);
        sendResponse({ success: true } satisfies MessageResponse);
        return true;
      }
      case 'ACTIVATE_HIGHLIGHTS': {
        const remoteHighlights = normalizeIncomingHighlights(message?.payload);
        void __engine
          .activateHighlights(remoteHighlights)
          .then(async success => {
            sendResponse({ success } satisfies MessageResponse);
            try {
              if (message?.payload?.autoLocate !== false) {
                await tryAutoLocateLatestSummaryIfEnabled(success, remoteHighlights);
              }
            } catch {
              // 忽略自动定位失败，避免影响用户操作
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

  return () => {
    __engine.abort();
    browser.runtime.onMessage.removeListener(runtimeMessageListener);
    window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = false;
  };
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



async function handleRequestSelection(
  sendResponse: (response: { success: boolean; error?: string }) => void
): Promise<boolean> {
  // 区域限制：仅允许在 http/https 普通网页上摘抄
  const currentUrl = window.location.href;
  if (!isSupportedHttpUrl(currentUrl)) {
    const msg = '当前页面不支持摘抄,仅支持在第三方网站的 http/https 页面使用。';
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
  const highlightId = generateHighlightId();
  const metadata = captureHighlightMetadata(activeRange, null, highlightId);
  const highlightSpan = wrapRangeInHighlight(activeRange, highlightId);

  if (!highlightSpan) {
    const msg = '无法为选区添加高亮';
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'REQUEST_SELECTION in content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }

  selection.removeAllRanges();

  const payload: Partial<Clip> = {
    textContent,
    htmlContent,
    sourceUrl: window.location.href,
    title: document.title,
    highlightId,
    contextBefore: metadata?.contextBefore,
    contextAfter: metadata?.contextAfter,
    anchorSelector: buildCssPath(highlightSpan.parentElement ?? undefined),
    textOffset: metadata?.textOffset,
    highlightStyle: 'inline'
  };

  try {
    const response = await sendMessage<MessageResponse<unknown>>({ type: 'SAVE_CLIP', payload });
    
    if (response?.success) {
      sendResponse({ success: true });
      return true;
    }

    const msg = response?.error ?? '保存失败';
    __engine.undo(highlightId);
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'SAVE_CLIP from content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  } catch (error) {
    __engine.undo(highlightId);
    const msg = ErrorHandler.getErrorMessage(error);
    void sendMessage({ type: 'LOG_ERROR', payload: { message: msg, context: 'SAVE_CLIP from content script' } });
    sendResponse({ success: false, error: msg });
    return false;
  }
}

function generateHighlightId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'highlight-' + Math.random().toString(36).slice(2, 11);
}

/** 输入高亮按创建时间倒序排列，定位最近一条能找到的摘录。 */
async function tryAutoLocateLatestSummaryIfEnabled(success: boolean, highlights: RemoteHighlight[]): Promise<void> {
  if (!success || __autoLocatePerformed) return;

  const response = await sendMessage<MessageResponse<SettingsOptions>>({ type: 'REQUEST_SETTINGS' });
  if (!response?.success || !response.data?.autoLocateFirstSummary) return;

  for (const highlight of highlights) {
    if (await __engine.focusClip(highlight)) {
      __autoLocatePerformed = true;
      return;
    }
  }
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


function wrapRangeInHighlight(range: Range | null, highlightId: string): HTMLSpanElement | null {
  if (!range || range.collapsed) {
    return null;
  }

  const spans = applyInline(range, highlightId);
  if (spans.length > 0) {
    return spans[0] as HTMLSpanElement;
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








