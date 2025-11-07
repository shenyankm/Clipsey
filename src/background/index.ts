import { getClipsForUrl } from './storage';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';
import type { Clip } from '@/types/clip';
import { indexedDBManager } from './indexeddb';
import { migrateAllData } from './migration';
import { migrateSettingsToLocal } from '@/background/migration-settings';
import { registerMessageRouter } from '@/background/handlers/message-router';
import { contentScriptService } from '@/background/services/content-script-service';
import { ErrorHandler } from '@/utils/error-handler';
import type { MessageResponse, HighlightPayload } from '@/types/message';

const CONTEXT_MENU_ID = 'clipsey-context-menu';
const HIGHLIGHT_MAX_ATTEMPTS = 5;
const HIGHLIGHT_RETRY_DELAY_MS = 400;
const REQUEST_SELECTION_MAX_ATTEMPTS = 3;
const REQUEST_SELECTION_RETRY_DELAY_MS = 200;
const NOTIFICATION_ICON = chrome.runtime.getURL('assets/icon128.png');

/**
 * 清理监听器的管理器，防止内存泄漏
 */
class ListenerManager {
  private listeners: Set<() => void> = new Set();

  addCleanup(cleanup: () => void): void {
    this.listeners.add(cleanup);
  }

  cleanup(): void {
    for (const cleanup of this.listeners) {
      try {
        cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
    this.listeners.clear();
  }
}

const listenerManager = new ListenerManager();

chrome.runtime.onInstalled.addListener(async () => {
  // 初始化IndexedDB
  try {
    await indexedDBManager.init();
    console.log('IndexedDB initialized successfully');
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'IndexedDB initialization');
    console.error(appError.userMessage);
  }

  // 执行数据迁移（从 chrome.storage.local 迁移到 IndexedDB）
  try {
    const migrationResult = await migrateAllData();
    if (migrationResult.clipsResult.migratedCount > 0 || migrationResult.errorLogsResult.migratedCount > 0) {
      console.log('[Migration] Data migration completed:', migrationResult);
    }
  } catch (error) {
    console.warn('[Migration] Data migration failed (non-critical):', error);
  }

  // 迁移基础设置到 chrome.storage.local（一次性）
  try {
    const settingsResult = await migrateSettingsToLocal();
    if (settingsResult.migrated) {
      console.log('[Migration] Settings migrated to chrome.storage.local');
    }
  } catch (error) {
    console.warn('[Migration] Settings migration failed (non-critical):', error);
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
        const appError = ErrorHandler.handle(error, 'Context menu creation');
        console.error(appError.userMessage);
      }
    }
  );

  try {
    await contentScriptService.registerContentScript();
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'Content script registration');
    console.error(appError.userMessage);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.debug('扩展启动');
  
  // 确保IndexedDB已初始化
  try {
    await indexedDBManager.init();
    console.log('IndexedDB initialized on startup');
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'IndexedDB startup initialization');
    console.error(appError.userMessage);
  }
  
  try {
    await contentScriptService.registerContentScript();
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'Content script registration on startup');
    console.error(appError.userMessage);
  }

  // 确保基础设置存在于 chrome.storage.local（如首次启动或本地数据被清理）
  try {
    const result = await migrateSettingsToLocal();
    if (result.migrated) {
      console.log('[Migration] Settings ensured in chrome.storage.local');
    }
  } catch (error) {
    console.warn('[Migration] Ensure settings in local failed (non-critical):', error);
  }
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
    const appError = ErrorHandler.handle(error, 'Request selection');
    console.error(appError.userMessage);
  });
});

// 使用消息路由处理所有 runtime 消息
registerMessageRouter();

// 在用户访问匹配网址时自动激活页面中的相关摘要高亮
const tabUpdateListener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
  try {
    const url = tab?.url;
    if (!url || changeInfo.status !== 'complete') {
      return;
    }

    void activatePageHighlights(tabId, url);
  } catch (error) {
    const appError = ErrorHandler.handle(error, 'Tab update');
    console.warn(appError.userMessage);
  }
};

chrome.tabs.onUpdated.addListener(tabUpdateListener);

// 注册清理函数，防止内存泄漏
listenerManager.addCleanup(() => {
  chrome.tabs.onUpdated.removeListener(tabUpdateListener);
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
  
  // 等待一小段时间,确保页面和内容脚本都已经准备好
  // 这解决了动态加载内容造成的 DOM 未就绪问题
  await delay(500);
  
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
    try {
      const response = await contentScriptService.sendMessageToTab<MessageResponse<unknown>>(tabId, {
        type: 'ACTIVATE_HIGHLIGHTS',
        payload: { highlights }
      });
      return Boolean(response?.success);
    } catch (error) {
      throw error;
    }
  };

  try {
    const success = await sendHighlightRequest();
    if (success) {
      return true;
    }

    const injected = await contentScriptService.injectContentScript(tabId);
    if (!injected) {
      return false;
    }

    return await sendHighlightRequest();
  } catch (error) {
    if (!contentScriptService.isMissingReceiverError(error)) {
      const appError = ErrorHandler.handle(error, 'Activate highlights');
      console.warn(appError.userMessage);
      return false;
    }

    const injected = await contentScriptService.injectContentScript(tabId);
    if (!injected) {
      return false;
    }

    try {
      return await sendHighlightRequest();
    } catch (retryError) {
      if (!contentScriptService.isMissingReceiverError(retryError)) {
        const appError = ErrorHandler.handle(retryError, 'Retry activate highlights');
        console.warn(appError.userMessage);
      }
      return false;
    }
  }
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
    const response = await contentScriptService.sendMessageToTab<MessageResponse<unknown>>(tabId, {
      type: 'REQUEST_SELECTION'
    });

    handleSelectionResponse(response);
  } catch (error) {
    if (contentScriptService.isFrameRemovedError(error) && attempt < REQUEST_SELECTION_MAX_ATTEMPTS - 1) {
      await delay(REQUEST_SELECTION_RETRY_DELAY_MS * (attempt + 1));
      await requestSelection(tabId, attempt + 1);
      return;
    }

    if (!contentScriptService.isMissingReceiverError(error)) {
      const appError = ErrorHandler.handle(error, 'Request selection');
      void showNotification('保存失败', appError.userMessage);
      throw error;
    }

    const injected = await contentScriptService.injectContentScript(tabId);
    if (!injected) {
      return;
    }

    try {
      const response = await contentScriptService.sendMessageToTab<MessageResponse<unknown>>(tabId, {
        type: 'REQUEST_SELECTION'
      });
      handleSelectionResponse(response);
    } catch (retryError) {
      if (contentScriptService.isMissingReceiverError(retryError)) {
        void showNotification(
          '保存失败',
          '此页面无法使用辅助脚本。'
        );
        return;
      }

      const appError = ErrorHandler.handle(retryError, 'Retry request selection');
      void showNotification('保存失败', appError.userMessage);
      throw retryError;
    }
  }
}


function handleSelectionResponse(response: MessageResponse<unknown> | undefined): void {
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

// 使用 utils 中的 isSupportedHttpUrl，移除重复实现

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
    const appError = ErrorHandler.handle(error, 'Show notification');
    console.warn(appError.userMessage);
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

// 导出清理函数，供测试或扩展卸载时调用
export function cleanup(): void {
  listenerManager.cleanup();
}









