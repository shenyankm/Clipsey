import type { AppMessage, MessageResponse } from '@/types/message';

// 封装 runtime 消息发送，统一错误处理
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

// 判断是否运行于 Chrome 扩展环境
export function isChromeExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}

// 类型安全的 runtime 消息发送
export function sendRuntimeMessage<TData = unknown>(message: AppMessage): Promise<MessageResponse<TData>> {
  return sendMessage<MessageResponse<TData>>(message);
}

// 向指定标签页发送应用消息（统一错误处理）
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
