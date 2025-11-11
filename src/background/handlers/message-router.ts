import { browser } from 'wxt/browser';
import { isValidMessage } from './middleware/validator';
import { ResponseBuilder } from './middleware/response';
import { registry } from './registry';

/** 注册消息路由：统一以 Promise 形式处理 */
export function registerMessageRouter(): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isValidMessage(message)) {
      sendResponse(ResponseBuilder.validationError('Invalid message format'));
      return;
    }

    const handler = registry.get(message.type);
    if (!handler) {
      sendResponse(ResponseBuilder.validationError(`Unknown message type: ${message.type}`));
      return;
    }

    handler(message, sender)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error(`[Message Router] Handler error for ${message.type}:`, error);
        sendResponse(ResponseBuilder.error(error, `Handle ${message.type}`));
      });

    // 返回 true，通知浏览器异步调用 sendResponse。
    return true;
  });
}
