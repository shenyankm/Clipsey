import { browser } from 'wxt/browser';

export type MessageResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 内容脚本服务：负责在需要时按需注入并处理通信。 */
export class ContentScriptService {
  private cachedContentScriptFiles: string[] | null = null;

  private resolveContentScriptFiles(): string[] {
    if (this.cachedContentScriptFiles) {
      return this.cachedContentScriptFiles;
    }

    const manifest = browser.runtime.getManifest();
    const files =
      manifest.content_scripts?.flatMap(entry => entry.js ?? [])?.filter(Boolean) ?? [];

    if (!files.length) {
      throw new Error('[ContentScriptService] No content script files defined in manifest.');
    }

    this.cachedContentScriptFiles = files;
    return files;
  }

  /** 如果 content script 尚未注入，则主动注入。 */
  async injectContentScript(tabId: number): Promise<boolean> {
    try {
      await this.sendMessageToTab(tabId, { type: 'PING' });
      return true;
    } catch (error) {
      if (!this.isMissingReceiverError(error)) {
        throw error;
      }
    }

    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: this.resolveContentScriptFiles()
      });
      await wait(100);
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
    return browser.tabs.sendMessage(tabId, message) as Promise<T>;
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
