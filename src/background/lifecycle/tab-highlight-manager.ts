import { getClipsForUrl } from '../storage';
import { contentScriptService } from '../services/content-script-service';
import { ErrorHandler } from '@/utils/error-handler';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';
import { listenerManager } from './listener-cleanup';
import type { Clip } from '@/types/clip';
import type { MessageResponse, HighlightPayload } from '@/types/message';

const HIGHLIGHT_MAX_ATTEMPTS = 8;
const HIGHLIGHT_RETRY_DELAY_MS = 600;
const HIGHLIGHT_INITIAL_DELAY_MS = 800;

/** 标签页高亮：在页面加载完成后自动激活相关摘要的高亮。 */
export class TabHighlightManager {
  /** 处理标签页更新事件。 */
  async handleTabUpdate(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> {
    try {
      const url = tab?.url;
      if (!url || changeInfo.status !== 'complete') {
        return;
      }

      void this.activatePageHighlights(tabId, url);
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Tab update');
      console.warn(appError.userMessage);
    }
  }

  /** 注册标签页更新监听器。 */
  registerListener(): void {
    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      void this.handleTabUpdate(tabId, changeInfo, tab);
    };

    chrome.tabs.onUpdated.addListener(listener);

    // 注册清理函数
    listenerManager.addCleanup(() => {
      chrome.tabs.onUpdated.removeListener(listener);
    });
  }

  /** 激活页面高亮。 */
  private async activatePageHighlights(tabId: number, url: string): Promise<void> {
    // 跳过不支持的URL
    if (!isSupportedHttpUrl(url)) {
      return;
    }

    const clips = await getClipsForUrl(url);
    if (!clips.length) {
      return;
    }

    const highlights = this.collectHighlightPayloads(clips);
    if (!highlights.length) {
      return;
    }
    
    // 等待更长时间,确保页面和内容脚本都已经准备好
    await delay(HIGHLIGHT_INITIAL_DELAY_MS);
    
    for (let attempt = 0; attempt < HIGHLIGHT_MAX_ATTEMPTS; attempt += 1) {
      const success = await this.attemptActivateHighlights(tabId, highlights);
      if (success) {
        console.log(`[Highlight] Successfully activated highlights on attempt ${attempt + 1}`);
        return;
      }

      // 使用递增延迟，给页面更多加载时间
      const delay_ms = HIGHLIGHT_RETRY_DELAY_MS * (attempt + 1);
      console.log(`[Highlight] Retry ${attempt + 1}/${HIGHLIGHT_MAX_ATTEMPTS} after ${delay_ms}ms`);
      await delay(delay_ms);
    }
    
    console.warn(`[Highlight] Failed to activate highlights after ${HIGHLIGHT_MAX_ATTEMPTS} attempts`);
  }

  /** 尝试激活高亮。 */
  private async attemptActivateHighlights(tabId: number, highlights: HighlightPayload[]): Promise<boolean> {
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

  /** 从剪辑集合收集高亮载荷。 */
  private collectHighlightPayloads(clips: Clip[]): HighlightPayload[] {
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
}

// 导出单例实例
export const tabHighlightManager = new TabHighlightManager();
