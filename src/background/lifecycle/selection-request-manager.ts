import { contentScriptService } from '../services/content-script-service';
import { ErrorHandler } from '@/utils/error-handler';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';
import type { MessageResponse } from '@/types/message';

const REQUEST_SELECTION_MAX_ATTEMPTS = 3;
const REQUEST_SELECTION_RETRY_DELAY_MS = 200;
const NOTIFICATION_ICON = chrome.runtime.getURL('assets/icon128.png');

/** 选区请求管理：右键触发后请求并保存选区，含系统页预检、重试与通知。 */
export class SelectionRequestManager {
  /**
   * 处理右键菜单点击事件。
   */
  async handleContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
    if (!tab?.id) {
      return;
    }

    if (!info.selectionText || !info.selectionText.trim()) {
      void this.showNotification('没有可保存的内容', '请选择要保存的文字后重试。');
      return;
    }

    await this.requestSelection(tab.id).catch(error => {
      const appError = ErrorHandler.handle(error, 'Request selection');
      console.error(appError.userMessage);
    });
  }

  /**
   * 向 content script 请求选区内容。
   */
  private async requestSelection(tabId: number, attempt = 0): Promise<void> {
    // 在系统页/非 http(s) 页面直接提示并终止请求
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab?.url;
      if (url && !isSupportedHttpUrl(url)) {
        void this.showNotification('当前页面不支持摘抄', '仅支持在第三方网站的 http/https 页面使用。');
        return;
      }
    } catch {
      // 如果查询标签页失败，继续执行并交由后续错误处理
    }
    
    try {
      const response = await contentScriptService.sendMessageToTab<MessageResponse<unknown>>(tabId, {
        type: 'REQUEST_SELECTION'
      });

      this.handleSelectionResponse(response);
    } catch (error) {
      if (contentScriptService.isFrameRemovedError(error) && attempt < REQUEST_SELECTION_MAX_ATTEMPTS - 1) {
        await delay(REQUEST_SELECTION_RETRY_DELAY_MS * (attempt + 1));
        await this.requestSelection(tabId, attempt + 1);
        return;
      }

      if (!contentScriptService.isMissingReceiverError(error)) {
        const appError = ErrorHandler.handle(error, 'Request selection');
        void this.showNotification('保存失败', appError.userMessage);
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
        this.handleSelectionResponse(response);
      } catch (retryError) {
        if (contentScriptService.isMissingReceiverError(retryError)) {
          void this.showNotification(
            '保存失败',
            '此页面无法使用辅助脚本。'
          );
          return;
        }

        const appError = ErrorHandler.handle(retryError, 'Retry request selection');
        void this.showNotification('保存失败', appError.userMessage);
        throw retryError;
      }
    }
  }

  /**
   * 处理选区请求响应。
   */
  private handleSelectionResponse(response: MessageResponse<unknown> | undefined): void {
    if (!response) {
      void this.showNotification('保存失败', '发生未知错误，请稍后重试。');
      return;
    }

    if (response.success) {
      void this.showNotification('保存成功', '打开插件弹窗以查看剪辑。');
      return;
    }

    if (response.error?.includes('未选择任何内容')) {
      void this.showNotification('没有可保存的内容', '请选择要保存的文字后重试。');
      return;
    }

    void this.showNotification('保存失败', response.error ?? '发生未知错误，请稍后重试。');
  }

  private async showNotification(title: string, message: string): Promise<void> {
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
}

// 导出单例实例
export const selectionRequestManager = new SelectionRequestManager();
