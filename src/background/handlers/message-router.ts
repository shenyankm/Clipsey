import { handleSaveClip } from '@/background/handlers/save-clip';
import { handleRequestClips } from '@/background/handlers/request-clips';
import { handleClearClips } from '@/background/handlers/clear-clips';
import { handleOpenClip } from '@/background/handlers/open-clip';
import { handleRequestSettings } from '@/background/handlers/request-settings';
import type { AppMessage, MessageResponse, SaveClipPayload } from '@/types/message';
import { ErrorHandler } from '@/utils/error-handler';

/**
 * 类型守卫：验证消息是否为有效的应用消息
 */
function isValidMessage(message: unknown): message is AppMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string'
  );
}

/**
 * 类型守卫：验证 SAVE_CLIP payload
 */
function isSaveClipPayload(payload: unknown): payload is SaveClipPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'textContent' in payload &&
    typeof (payload as { textContent: unknown }).textContent === 'string'
  );
}

/**
 * 类型守卫：验证 OPEN_CLIP payload
 */
function isOpenClipPayload(payload: unknown): payload is { id: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    typeof (payload as { id: unknown }).id === 'string'
  );
}

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    // 验证消息格式
    if (!isValidMessage(message)) {
      sendResponse({ 
        success: false, 
        error: 'Invalid message format' 
      } satisfies MessageResponse);
      return false;
    }

    // 路由消息到对应的处理器
    switch (message.type) {
      case 'SAVE_CLIP': {
        if (!isSaveClipPayload(message.payload)) {
          sendResponse({ 
            success: false, 
            error: 'Invalid SAVE_CLIP payload' 
          } satisfies MessageResponse);
          return false;
        }
        
        handleSaveClip(message.payload)
          .then(() => sendResponse({ success: true } satisfies MessageResponse))
          .catch(error => {
            const appError = ErrorHandler.handle(error, 'Save clip');
            sendResponse({ 
              success: false, 
              error: appError.userMessage 
            } satisfies MessageResponse);
          });
        return true;
      }
      
      case 'REQUEST_CLIPS':
        handleRequestClips()
          .then(clips => sendResponse({ 
            success: true, 
            data: clips 
          } satisfies MessageResponse))
          .catch(error => {
            const appError = ErrorHandler.handle(error, 'Request clips');
            sendResponse({ 
              success: false, 
              error: appError.userMessage 
            } satisfies MessageResponse);
          });
        return true;
      
      case 'REQUEST_SETTINGS':
        handleRequestSettings()
          .then(options => sendResponse({ 
            success: true, 
            data: options 
          } satisfies MessageResponse))
          .catch(error => {
            const appError = ErrorHandler.handle(error, 'Request settings');
            sendResponse({ 
              success: false, 
              error: appError.userMessage 
            } satisfies MessageResponse);
          });
        return true;
      
      case 'CLEAR_CLIPS':
        handleClearClips()
          .then(() => sendResponse({ success: true } satisfies MessageResponse))
          .catch(error => {
            const appError = ErrorHandler.handle(error, 'Clear clips');
            sendResponse({ 
              success: false, 
              error: appError.userMessage 
            } satisfies MessageResponse);
          });
        return true;
      
      case 'OPEN_CLIP': {
        if (!isOpenClipPayload(message.payload)) {
          sendResponse({ 
            success: false, 
            error: 'Invalid OPEN_CLIP payload' 
          } satisfies MessageResponse);
          return false;
        }
        
        handleOpenClip(message.payload.id)
          .then(() => sendResponse({ success: true } satisfies MessageResponse))
          .catch(error => {
            const appError = ErrorHandler.handle(error, 'Open clip');
            sendResponse({ 
              success: false, 
              error: appError.userMessage 
            } satisfies MessageResponse);
          });
        return true;
      }
      
      default:
        // 未知的消息类型
        sendResponse({ 
          success: false, 
          error: `Unknown message type: ${message.type}` 
        } satisfies MessageResponse);
        return false;
    }
  });
}