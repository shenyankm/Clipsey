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

export interface RequestSettingsMessage extends RuntimeMessage {
  type: 'REQUEST_SETTINGS';
}

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
  | ActivateHighlightsMessage;
