import type { AppMessage, MessageResponse } from '@/types/message';

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

export function isChromeExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}

/**
 * 类型安全的 runtime 消息发送封装
 * 返回统一的 MessageResponse<T>，便于统一错误与数据处理
 */
export function sendRuntimeMessage<TData = unknown>(message: AppMessage): Promise<MessageResponse<TData>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
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

/**
 * 类型安全的 tab 消息发送封装
 * 背景页或具有 tabs 权限的上下文可用
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
