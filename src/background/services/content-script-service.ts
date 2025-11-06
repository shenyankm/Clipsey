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

  async injectContentScript(tabId: number): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [CONTENT_SCRIPT_FILE]
      });
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