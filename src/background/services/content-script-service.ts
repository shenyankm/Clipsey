import { browser } from 'wxt/browser';
// 内容脚本实际路径为 content-scripts/content.js（WXT 构建）；使用旧路径会导致注入失败并出现“接收端不存在”等错误。
const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

export type MessageResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/** 内容脚本服务：负责注入与消息交互；WXT 会自动注册内容脚本。 */
export class ContentScriptService {
  // 为兼容保留，通常无需调用
  // @deprecated WXT 会自动注册 content script
  async registerContentScript(): Promise<void> {
    if (import.meta.env.DEV) {
      console.log('[ContentScriptService] WXT 自动注册内容脚本');
    }
  }

  // 注入内容脚本：先探测是否已存在；注入后小延时；系统页按错误类型处理
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
      await browser.scripting.executeScript({
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

  async sendMessageToTab<T = unknown>(tabId: number, message: unknown): Promise<T> {    return browser.tabs.sendMessage(tabId, message) as Promise<T>;  }

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

  isNoSuchContentScriptError(_error: unknown): boolean {
    // 此方法保留以保持 API 兼容性，但 WXT 下不再需要
    return false;
  }

  isDuplicateScriptIdError(_error: unknown): boolean {
    // 此方法保留以保持 API 兼容性，但 WXT 下不再需要
    return false;
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


