import { addClip, clearClips, getClips, getClipsForUrl } from './storage';
import { createId, delay } from '@/utils/helpers';
import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { DevTools } from './dev-tools';

const CONTEXT_MENU_ID = 'clipsey-context-menu';
const CONTENT_SCRIPT_ID = 'clipsey-selection';
const CONTENT_SCRIPT_FILE = 'scripts/content.js';
const CONTENT_MATCHES = ['https://*/*', 'http://*/*'];
const FOCUS_MAX_ATTEMPTS = 5;
const FOCUS_RETRY_DELAY_MS = 400;
const HIGHLIGHT_MAX_ATTEMPTS = 5;
const HIGHLIGHT_RETRY_DELAY_MS = 400;
const REQUEST_SELECTION_MAX_ATTEMPTS = 3;
const REQUEST_SELECTION_RETRY_DELAY_MS = 200;
const NOTIFICATION_ICON = chrome.runtime.getURL('assets/icon128.png');

type MessageResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

type HighlightPayload = {
  id: string;
  highlightId?: string;
  textContent: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
};

chrome.runtime.onInstalled.addListener(async () => {
  // 初始化IndexedDB
  try {
    await indexedDBManager.init();
    console.log('IndexedDB initialized successfully');
  } catch (error) {
    console.error('Failed to initialize IndexedDB:', error);
  }

  // 清理旧版本遗留的上下文菜单标识
  chrome.contextMenus.remove('page-clipper-context-menu', () => {
    const removalError = chrome.runtime.lastError;
    if (removalError && removalError.message && !removalError.message.includes('Cannot find menu item')) {
      console.debug('移除旧上下文菜单时的非致命错误', removalError);
    }
  });

  chrome.contextMenus.create(
    {
      id: CONTEXT_MENU_ID,
      title: '保存当前选中内容',
      contexts: ['selection']
    },
    () => {
      const error = chrome.runtime.lastError;
      if (error && !error.message?.includes('duplicate id')) {
        console.error('创建右键菜单失败', error);
      }
    }
  );

  registerContentScript().catch(error => {
    console.error('注册内容脚本失败', error);
  });
});

chrome.runtime.onStartup.addListener(async () => {
  console.debug('扩展启动');
  
  // 确保IndexedDB已初始化
  try {
    await indexedDBManager.init();
    console.log('IndexedDB initialized on startup');
  } catch (error) {
    console.error('Failed to initialize IndexedDB on startup:', error);
  }
  
  registerContentScript().catch(error => {
    console.error('启动时注册内容脚本失败', error);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
    return;
  }

  if (!info.selectionText || !info.selectionText.trim()) {
    void showNotification('没有可保存的内容', '请选择要保存的文字后重试。');
    return;
  }

  requestSelection(tab.id).catch(error => {
    console.error('请求选区失败', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'SAVE_CLIP':
      handleSaveClip(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'REQUEST_CLIPS':
      getClips()
        .then(clips => sendResponse({ success: true, data: clips }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'CLEAR_CLIPS':
      clearClips()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'OPEN_CLIP':
      handleOpenClip(message?.payload?.id)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    default:
      break;
  }

  return false;
});

// 在用户访问匹配网址时自动激活页面中的相关摘要高亮
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    const url = tab?.url;
    if (!url || changeInfo.status !== 'complete') {
      return;
    }

    void activatePageHighlights(tabId, url);
  } catch (error) {
    console.warn('自动启用高亮失败', error);
  }
});

async function activatePageHighlights(tabId: number, url: string): Promise<void> {
  // Skip unsupported URLs before asking the content script to highlight.
  if (!isSupportedHttpUrl(url)) {
    return;
  }

  const clips = await getClipsForUrl(url);
  if (!clips.length) {
    return;
  }
  const highlights = collectHighlightPayloads(clips);
  if (!highlights.length) {
    return;
  }
  for (let attempt = 0; attempt < HIGHLIGHT_MAX_ATTEMPTS; attempt += 1) {
    const success = await attemptActivateHighlights(tabId, highlights);
    if (success) {
      return;
    }

    await delay(HIGHLIGHT_RETRY_DELAY_MS);
  }
}

async function attemptActivateHighlights(
  tabId: number,
  highlights: HighlightPayload[]
): Promise<boolean> {
  const sendHighlightRequest = async (): Promise<boolean> => {
    const response = await sendMessageToTab(tabId, {
      type: 'ACTIVATE_HIGHLIGHTS',
      payload: { highlights }
    });

    return Boolean((response as { success?: boolean })?.success);
  };

  try {
    const success = await sendHighlightRequest();
    if (success) {
      return true;
    }

    const injected = await injectContentScript(tabId);
    if (!injected) {
      return false;
    }

    return await sendHighlightRequest();
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      console.warn('Failed to apply highlights', error);
      return false;
    }

    const injected = await injectContentScript(tabId);
    if (!injected) {
      return false;
    }

    try {
      return await sendHighlightRequest();
    } catch (retryError) {
      if (!isMissingReceiverError(retryError)) {
        console.warn('Failed to apply highlights', retryError);
      }
      return false;
    }
  }
}

async function handleSaveClip(payload: Partial<Clip> & { textContent?: string }): Promise<void> {
  if (!payload?.textContent) {
    return;
  }

  const sourceUrl = payload.sourceUrl ?? '';
  const highlightId =
    typeof payload.highlightId === 'string' && payload.highlightId ? payload.highlightId : undefined;
  const existingForUrl = highlightId ? await getClipsForUrl(sourceUrl) : [];
  const existingClip = highlightId
    ? existingForUrl.find(
        clip => clip.highlightId === highlightId && clip.sourceUrl === sourceUrl
      )
    : undefined;

  const clip: Clip = {
    id: createId(),
    sourceUrl,
    title: payload.title,
    textContent: payload.textContent,
    htmlContent: payload.htmlContent,
    createdAt: existingClip?.createdAt ?? new Date().toISOString(),
    highlightId,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    anchorSelector: payload.anchorSelector,
    textOffset:
      typeof payload.textOffset === 'number' && Number.isFinite(payload.textOffset)
        ? payload.textOffset
        : existingClip?.textOffset,
    highlightStyle: payload.highlightStyle ?? existingClip?.highlightStyle ?? 'inline'
  };

  await addClip(clip);
}

async function handleOpenClip(clipId?: string): Promise<void> {
  if (!clipId) {
    throw new Error('缺少剪辑 ID');
  }

  const clips = await getClips();
  const clip = clips.find(entry => entry.id === clipId);
  if (!clip) {
    throw new Error('未找到剪辑');
  }

  if (!clip.sourceUrl) {
    throw new Error('该剪辑没有来源链接');
  }

  if (!isSupportedHttpUrl(clip.sourceUrl)) {
    throw new Error('剪辑包含不受支持的链接');
  }

  const tab = await chrome.tabs.create({ url: clip.sourceUrl });
  if (!tab?.id) {
    throw new Error('无法打开剪辑页面');
  }

  const tabId = tab.id;
  const scheduleFocus = () => {
    if (!clip.textContent) {
      return;
    }

    void attemptFocusClip(tabId, clip);
  };

  if (tab.status === 'complete') {
    setTimeout(scheduleFocus, 300);
    return;
  }

  const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
    updatedTabId,
    changeInfo
  ) => {
    if (updatedTabId !== tabId) {
      return;
    }

    if (changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(scheduleFocus, 300);
    }
  };

  chrome.tabs.onUpdated.addListener(listener);

  setTimeout(() => {
    if (chrome.tabs.onUpdated.hasListener(listener)) {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(scheduleFocus, 500);
    }
  }, 15000);
}

async function requestSelection(tabId: number, attempt = 0): Promise<void> {
  // 预检查：避免向受限页面（如 chrome://）发送消息
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab?.url;
    if (url && !isSupportedHttpUrl(url)) {
      void showNotification('无法访问页面', '此页面不允许扩展脚本运行。');
      return;
    }
  } catch {
    // 如果查询标签页失败，继续执行并交由后续错误处理
  }
  try {
    const response = (await sendMessageToTab(tabId, {
      type: 'REQUEST_SELECTION'
    })) as MessageResponse;

    handleSelectionResponse(response);
  } catch (error) {
    if (isFrameRemovedError(error) && attempt < REQUEST_SELECTION_MAX_ATTEMPTS - 1) {
      await delay(REQUEST_SELECTION_RETRY_DELAY_MS * (attempt + 1));
      await requestSelection(tabId, attempt + 1);
      return;
    }

    if (!isMissingReceiverError(error)) {
      void showNotification('保存失败', getErrorMessage(error));
      throw error;
    }

    const injected = await injectContentScript(tabId);
    if (!injected) {
      return;
    }

    try {
      const response = (await sendMessageToTab(tabId, {
        type: 'REQUEST_SELECTION'
      })) as MessageResponse;
      handleSelectionResponse(response);
    } catch (retryError) {
      if (isMissingReceiverError(retryError)) {
        void showNotification(
          '保存失败',
          '此页面无法使用辅助脚本。'
        );
        return;
      }

      void showNotification('保存失败', getErrorMessage(retryError));
      throw retryError;
    }
  }
}

async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE]
    });
    return true;
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      message.includes('Cannot access contents of url') ||
      message.includes('Cannot access a chrome:// URL')
    ) {
      void showNotification('无法访问页面', '此页面不允许扩展脚本运行。');
      return false;
    }

    throw error;
  }
}

async function registerContentScript(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID, 'page-clipper-selection'] });
  } catch (error) {
    if (!isNoSuchContentScriptError(error)) {
      throw error;
    }
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches: CONTENT_MATCHES,
        js: [CONTENT_SCRIPT_FILE],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }
    ]);
  } catch (error) {
    if (isDuplicateScriptIdError(error)) {
      return;
    }

    throw error;
  }
}

function isMissingReceiverError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message;
  if (!message) {
    return false;
  }

  return message.includes('Receiving end does not exist') || isFrameRemovedError(error);
}

function isNoSuchContentScriptError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message;
  if (!message) {
    return false;
  }

  return message.includes('No such content script') || message.includes('Nonexistent script ID');
}

function isDuplicateScriptIdError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message?.toLowerCase();
  if (!message) {
    return false;
  }

  return message.includes('duplicate script id');
}

function isFrameRemovedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message?.toLowerCase();
  if (!message) {
    return false;
  }

  return message.includes('frame with id') && message.includes('removed');
}

async function attemptFocusClip(tabId: number, clip: Clip): Promise<void> {
  if (!clip.textContent) {
    return;
  }

  let attemptedManualInjection = false;

  for (let attempt = 0; attempt < FOCUS_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendMessageToTab(tabId, {
        type: 'FOCUS_CLIP',
        payload: {
          id: clip.id,
          textContent: clip.textContent
        }
      });

      if ((response as { success?: boolean })?.success) {
        return;
      }
    } catch (error) {
      if (isMissingReceiverError(error)) {
        if (!attemptedManualInjection) {
          attemptedManualInjection = true;
          try {
            const injected = await injectContentScript(tabId);
            if (!injected) {
              return;
            }
          } catch (injectionError) {
            console.warn('注入辅助脚本失败', injectionError);
            return;
          }
        }
      } else {
        console.warn('定位剪辑失败', error);
        return;
      }
    }

    await delay(FOCUS_RETRY_DELAY_MS);
  }
}

function handleSelectionResponse(response: MessageResponse | undefined): void {
  if (!response) {
    void showNotification('保存失败', '发生未知错误，请稍后重试。');
    return;
  }

  if (response.success) {
    void showNotification('保存成功', '打开插件弹窗以查看剪辑。');
    return;
  }

  if (response.error?.includes('未选择任何内容')) {
    void showNotification('没有可保存的内容', '请选择要保存的文字后重试。');
    return;
  }

  void showNotification('保存失败', response.error ?? '发生未知错误，请稍后重试。');
}

function isSupportedHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? '未知错误');
  }

  return (
    (error as { message?: string; toString?: () => string }).message ??
    (error as { toString?: () => string }).toString?.() ??
    '未知错误'
  );
}

async function showNotification(title: string, message: string): Promise<void> {
  if (!chrome.notifications?.create) {
    console.warn('通知 API 不可用。');
    return;
  }

  try {
    await chrome.notifications.create({
      type: 'basic',
      title,
      message,
      iconUrl: NOTIFICATION_ICON
    });
  } catch (error) {
    console.warn('无法显示通知', error);
  }
}

function collectHighlightPayloads(clips: Clip[]): HighlightPayload[] {
  const seen = new Set<string>();
  const highlights: HighlightPayload[] = [];

  for (const clip of clips) {
    const text = clip.textContent?.trim();
    if (!text) {
      continue;
    }

    const key = clip.highlightId ?? `${clip.sourceUrl}:${text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    highlights.push({
      id: clip.highlightId ?? clip.id,
      highlightId: clip.highlightId,
      textContent: text,
      contextBefore: clip.contextBefore,
      contextAfter: clip.contextAfter,
      anchorSelector: clip.anchorSelector,
      textOffset: clip.textOffset,
      highlightStyle: clip.highlightStyle
    });
  }

  return highlights;
}









