const CONTENT_SCRIPT_ID = 'clipsey-selection';
const CONTENT_SCRIPT_FILE = 'scripts/content.js';
const CONTENT_MATCHES = ['https://*/*', 'http://*/*'];

export type MessageResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * ContentScriptService 负责与内容脚本的交互：注册、注入、消息发送。
 */
export class ContentScriptService {
  async registerContentScript(): Promise<void> {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID, 'page-clipper-selection'] });
    } catch (error) {
      if (!this.isNoSuchContentScriptError(error)) {
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
      if (this.isDuplicateScriptIdError(error)) {
        return;
      }

      throw error;
    }
  }

  /**
   * 注入内容脚本。
   * 注意:由于内容脚本已通过 registerContentScript 注册,
   * 此方法主要用于处理已经打开的标签页(扩展安装前)。
   * 为防止重复注入,首先检测脚本是否已存在。
   */
  async injectContentScript(tabId: number): Promise<boolean> {
    // 首先检测内容脚本是否已经存在
    try {
      await this.sendMessageToTab(tabId, { type: 'PING' });
      // 如果没有抛出异常,说明内容脚本已经存在,不需要重复注入
      return true;
    } catch (error) {
      // 如果发送消息失败,说明内容脚本不存在,需要注入
      if (!this.isMissingReceiverError(error)) {
        // 其他错误直接抛出
        throw error;
      }
    }

    // 内容脚本不存在,执行注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [CONTENT_SCRIPT_FILE]
      });
      
      // 注入后等待一小段时间,确保脚本完全初始化
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (
        message.includes('Cannot access contents of url') ||
        message.includes('Cannot access a chrome:// URL')
      ) {
        return false;
      }

      throw error;
    }
  }

  async sendMessageToTab<T = unknown>(tabId: number, message: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(response as T);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  isMissingReceiverError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const message = (error as { message?: string }).message;
    if (!message) {
      return false;
    }
    return (
      message.includes('Receiving end does not exist') ||
      this.isFrameRemovedError(error) ||
      this.isNoTabError(error)
    );
  }

  isNoSuchContentScriptError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const message = (error as { message?: string }).message;
    if (!message) {
      return false;
    }
    return message.includes('No such content script') || message.includes('Nonexistent script ID');
  }

  isDuplicateScriptIdError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const message = (error as { message?: string }).message?.toLowerCase();
    if (!message) {
      return false;
    }
    return message.includes('duplicate script id');
  }

  isFrameRemovedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const message = (error as { message?: string }).message?.toLowerCase();
    if (!message) {
      return false;
    }
    return message.includes('frame with id') && message.includes('removed');
  }

  isNoTabError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const message = (error as { message?: string }).message;
    if (!message) {
      return false;
    }
    return message.includes('No tab with id');
  }

  getErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error ?? '未知错误');
    }
    return (
      (error as { message?: string; toString?: () => string }).message ??
      (error as { toString?: () => string }).toString?.() ??
      '未知错误'
    );
  }
}

export const contentScriptService = new ContentScriptService();