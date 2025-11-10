import { isValidMessage } from './middleware/validator';
import { ResponseBuilder } from './middleware/response';
import { registry } from './registry';

/** 注册消息路由器：通过注册表将消息分发给处理器（策略模式）。 */
export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // 验证消息格式
    if (!isValidMessage(message)) {
      sendResponse(ResponseBuilder.validationError('Invalid message format'));
      return false;
    }

    // 查找对应的处理器
    const handler = registry.get(message.type);
    if (!handler) {
      sendResponse(ResponseBuilder.validationError(`Unknown message type: ${message.type}`));
      return false;
    }

    // 异步执行处理器
    handler(message, sender)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error(`[Message Router] Handler error for ${message.type}:`, error);
        sendResponse(ResponseBuilder.error(error, `Handle ${message.type}`));
      });

    return true; // 保持消息通道开启以支持异步响应
  });
}