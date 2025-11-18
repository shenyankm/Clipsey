import { browser } from 'wxt/browser';
import { contentScriptService } from '../services/content-script-service';
import { ErrorHandler } from '@/utils/error-handler';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';
import type { MessageResponse } from '@/types/message';

const REQUEST_SELECTION_MAX_ATTEMPTS = 3;
const REQUEST_SELECTION_RETRY_DELAY_MS = 200;
// 使用相对路径，由浏览器自动解析
const NOTIFICATION_ICON = '/icon128.png';

type ContextMenuListener = Parameters<typeof browser.contextMenus.onClicked.addListener>[0];
type ContextMenuClickInfo = ContextMenuListener extends (...args: infer Args) => any ? Args[0] : never;
type ContextMenuTab = ContextMenuListener extends (...args: infer Args) => any ? Args[1] : never;

/** 选区请求管理：处理右键菜单请求并引导选区保存，同时反馈通知。 */
export class SelectionRequestManager {
  /** 处理右键菜单点击事件 */
  async handleContextMenuClick(info: ContextMenuClickInfo, tab?: ContextMenuTab): Promise<void> {
    if (!tab?.id) {
      return;
    }

    if (!info.selectionText || !info.selectionText.trim()) {
      void this.showNotification('无可保存的内容', '请先选择需要摘录的文本。');
      return;
    }

    const pageUrl = tab.url ?? info.pageUrl ?? tab.pendingUrl ?? '';
    
    if (!pageUrl || !isSupportedHttpUrl(pageUrl)) {
      void this.showNotification('当前页面不支持摘录', '仅支持在普通 http/https 页面使用。');
      return;
    }

    // 使用 activeTab 权限，无需额外请求就能访问当前标签页
    // 右键菜单点击已经是用户手势，可以直接使用 activeTab
    
    await this.requestSelection(tab.id).catch(error => {
      const appError = ErrorHandler.handle(error, 'Request selection');
      console.error(appError.userMessage, error);
    });
  }

  /** 请求选中内容，并向内容脚本发送消息完成高亮和持久化 */
  private async requestSelection(tabId: number, attempt = 0): Promise<void> {
    // 在系统页/非 http(s) 页直接提示阻止
    try {
      const tab = await browser.tabs.get(tabId);
      const url = tab?.url;
      
      if (url && !isSupportedHttpUrl(url)) {
        void this.showNotification('当前页面不支持摘录', '仅支持在普通 http/https 页面使用。');
        return;
      }
    } catch (error) {
      // 查询标签页失败时继续尝试，交由后续逻辑处理
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
        void this.showNotification('请求失败', appError.userMessage);
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
            '请求失败',
            '该页面无法使用内容脚本'
          );
          return;
        }

        const appError = ErrorHandler.handle(retryError, 'Retry request selection');
        void this.showNotification('请求失败', appError.userMessage);
        throw retryError;
      }
    }
  }

  /** 处理选区请求的响应 */
  private handleSelectionResponse(response: MessageResponse<unknown> | undefined): void {
    if (!response) {
      void this.showNotification('请求失败', '出现未知错误，请稍后再试。');
      return;
    }

    if (response.success) {
      void this.showNotification('保存成功', '打开扩展面板即可查看摘录。');
      return;
    }

    if (response.error?.includes('未选择任何内容')) {
      void this.showNotification('无可保存的内容', '请先选择需要摘录的文本。');
      return;
    }

    void this.showNotification('请求失败', response.error ?? '出现未知错误，请稍后再试。');
  }

  private async showNotification(title: string, message: string): Promise<void> {
    if (!browser.notifications?.create) {
      console.warn('通知 API 不可用。');
      return;
    }

    try {
      await browser.notifications.create({
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

// 导出单例
export const selectionRequestManager = new SelectionRequestManager();
