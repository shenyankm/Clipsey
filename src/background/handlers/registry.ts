import type { AppMessage, MessageResponse } from '@/types/message';
import type { WxtBrowser } from 'wxt/browser';
import type { SettingsOptions } from '@/utils/settings-local';
import { handleSaveClip } from './save-clip';
import { handleRequestClips } from './request-clips';
import { handleClearClips } from './clear-clips';
import { handleOpenClip } from './open-clip';
import { handleRequestSettings } from './request-settings';
import { handleLogError } from './log-error';
import { exportAllData, importAllData, refreshClipsCache } from '@/background/api';
import { ResponseBuilder, wrapHandler } from './middleware/response';
import {
  isSaveClipPayload,
  isOpenClipPayload,
  isImportDataPayload
} from './middleware/validator';

type RuntimeMessageListener = Parameters<WxtBrowser['runtime']['onMessage']['addListener']>[0];
type RuntimeMessageSender = RuntimeMessageListener extends (
  message: any,
  sender: infer Sender,
  ...args: any[]
) => any
  ? Sender
  : never;

/** 消息处理函数：解析消息并返回统一响应。 */
type MessageHandler = (message: AppMessage, sender: RuntimeMessageSender) => Promise<MessageResponse>;

/** 消息处理器注册表。 */
class HandlerRegistry {
  private handlers = new Map<string, MessageHandler>();

  /** 注册指定类型的消息处理器。 */
  register(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  /** 获取指定类型的消息处理器。 */
  get(type: string): MessageHandler | undefined {
    return this.handlers.get(type);
  }

  /** 判断是否存在对应的消息处理器。 */
  has(type: string): boolean {
    return this.handlers.has(type);
  }
}

// 创建全局注册表实例
export const registry = new HandlerRegistry();

// 注册所有消息处理器
registry.register('LOG_ERROR', async (message) => {
  return wrapHandler(
    () => handleLogError(message.payload).then(() => undefined),
    'Log error'
  );
});

registry.register('SAVE_CLIP', async (message) => {
  if (!isSaveClipPayload(message.payload)) {
    return ResponseBuilder.validationError('Invalid SAVE_CLIP payload');
  }
  const payload = message.payload;
  return wrapHandler(() => handleSaveClip(payload), 'Save clip');
});

registry.register('REQUEST_CLIPS', async () => {
  return wrapHandler(() => handleRequestClips(), 'Request clips');
});

registry.register('REQUEST_SETTINGS', async () => {
  return wrapHandler<SettingsOptions>(() => handleRequestSettings(), 'Request settings');
});

registry.register('CLEAR_CLIPS', async () => {
  return wrapHandler(() => handleClearClips(), 'Clear clips');
});

registry.register('OPEN_CLIP', async (message) => {
  if (!isOpenClipPayload(message.payload)) {
    return ResponseBuilder.validationError('Invalid OPEN_CLIP payload');
  }
  const payload = message.payload;
  return wrapHandler(() => handleOpenClip(payload.id), 'Open clip');
});

registry.register('EXPORT_DATA', async () => {
  return wrapHandler(() => exportAllData(), 'Export data');
});

registry.register('IMPORT_DATA', async (message) => {
  if (!isImportDataPayload(message.payload)) {
    return ResponseBuilder.validationError('Invalid IMPORT_DATA payload');
  }
  const payload = message.payload;
  return wrapHandler(() => importAllData(payload), 'Import data');
});

registry.register('REFRESH_CACHE', async () => {
  return wrapHandler(() => refreshClipsCache(), 'Refresh cache');
});

