import { browser } from 'wxt/browser';
import type { AppMessage, MessageResponse } from '@/types/message';

function ensureRuntime(): void {
  if (typeof browser === 'undefined' || !browser.runtime) {
    throw new Error('WebExtension runtime is not available.');
  }
}

// 包装 runtime 消息发送，统一 Promise 化
export function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  ensureRuntime();
  return browser.runtime.sendMessage(message) as Promise<TResponse>;
}

// 判断是否运行在扩展环境（兼容历史命名）
export function isChromeExtensionEnv(): boolean {
  return typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined';
}

// 发送包含类型约束的 runtime 消息
export function sendRuntimeMessage<TData = unknown>(message: AppMessage): Promise<MessageResponse<TData>> {
  return sendMessage<MessageResponse<TData>>(message);
}

// 对指定标签发送消息
export function sendTabMessage<TData = unknown>(tabId: number, message: AppMessage): Promise<MessageResponse<TData>> {
  ensureRuntime();
  return browser.tabs.sendMessage(tabId, message) as Promise<MessageResponse<TData>>;
}
