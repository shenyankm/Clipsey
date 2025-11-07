/**
 * 消息类型定义 - 统一管理所有消息通信的类型
 */

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RuntimeMessage {
  type: string;
  payload?: unknown;
}

export interface SaveClipMessage extends RuntimeMessage {
  type: 'SAVE_CLIP';
  payload: SaveClipPayload;
}

export interface RequestClipsMessage extends RuntimeMessage {
  type: 'REQUEST_CLIPS';
}

import type { SettingsOptions } from '@/utils/settings-local';

export interface RequestSettingsMessage extends RuntimeMessage {
  type: 'REQUEST_SETTINGS';
}

// 请求设置的标准响应类型，统一为 SettingsOptions
export type RequestSettingsResponse = MessageResponse<SettingsOptions>;

export interface ClearClipsMessage extends RuntimeMessage {
  type: 'CLEAR_CLIPS';
}

export interface OpenClipMessage extends RuntimeMessage {
  type: 'OPEN_CLIP';
  payload: { id: string };
}

export interface RequestSelectionMessage extends RuntimeMessage {
  type: 'REQUEST_SELECTION';
}

export interface FocusClipMessage extends RuntimeMessage {
  type: 'FOCUS_CLIP';
  payload: FocusClipPayload;
}

export interface ActivateHighlightsMessage extends RuntimeMessage {
  type: 'ACTIVATE_HIGHLIGHTS';
  payload: { highlights: HighlightPayload[] };
}

export interface LogErrorMessage extends RuntimeMessage {
  type: 'LOG_ERROR';
  payload: { message?: string; context?: string; stack?: string };
}

export interface ExportDataMessage extends RuntimeMessage {
  type: 'EXPORT_DATA';
}

export interface ImportDataMessage extends RuntimeMessage {
  type: 'IMPORT_DATA';
  payload: {
    clips?: unknown[];
    errorLogs?: unknown[];
  };
}

export interface RefreshCacheMessage extends RuntimeMessage {
  type: 'REFRESH_CACHE';
}

export interface SaveClipPayload {
  textContent: string;
  sourceUrl?: string;
  title?: string;
  htmlContent?: string;
  highlightId?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
}

export interface FocusClipPayload {
  id?: string;
  textContent?: string;
}

export interface HighlightPayload {
  id: string;
  highlightId?: string;
  textContent: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
}

export type AppMessage =
  | SaveClipMessage
  | RequestClipsMessage
  | RequestSettingsMessage
  | ClearClipsMessage
  | OpenClipMessage
  | RequestSelectionMessage
  | FocusClipMessage
  | ActivateHighlightsMessage
  | LogErrorMessage
  | ExportDataMessage
  | ImportDataMessage
  | RefreshCacheMessage;
