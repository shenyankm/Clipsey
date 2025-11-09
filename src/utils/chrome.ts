import type { AppMessage, MessageResponse } from '@/types/message';

/**
 * 通用的 runtime 消息发送封装
 * @param message 任意消息对象
 * @returns Promise包裹的响应
 */
export function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 检查是否在 Chrome 扩展环境中
 */
export function isChromeExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}

/**
 * 类型安全的 runtime 消息发送封装
 * @param message 应用消息对象
 * @returns Promise<MessageResponse<TData>>
 */
export function sendRuntimeMessage<TData = unknown>(message: AppMessage): Promise<MessageResponse<TData>> {
  return sendMessage<MessageResponse<TData>>(message);
}

/**
 * 类型安全的 tab 消息发送封装
 * @param tabId 标签页ID
 * @param message 应用消息对象
 * @returns Promise<MessageResponse<TData>>
 */
export function sendTabMessage<TData = unknown>(tabId: number, message: AppMessage): Promise<MessageResponse<TData>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response as MessageResponse<TData>);
      });
    } catch (error) {
      reject(error);
    }
  });
}
