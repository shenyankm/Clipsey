import type { AppMessage, SaveClipPayload } from '@/types/message';

// 类型守卫：验证是否为有效的应用消息
export function isValidMessage(message: unknown): message is AppMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string'
  );
}

// 类型守卫：验证 SAVE_CLIP 的 payload
export function isSaveClipPayload(payload: unknown): payload is SaveClipPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'textContent' in payload &&
    typeof (payload as { textContent: unknown }).textContent === 'string'
  );
}

// 类型守卫：验证 OPEN_CLIP 的 payload
export function isOpenClipPayload(payload: unknown): payload is { id: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    typeof (payload as { id: unknown }).id === 'string'
  );
}

// 类型守卫：验证 IMPORT_DATA 的 payload
export function isImportDataPayload(payload: unknown): payload is { clips?: any[]; errorLogs?: any[] } {
  return typeof payload === 'object' && payload !== null;
}

export function isRequestClipsPagedPayload(payload: unknown): payload is {
  url: string;
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
} {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as any;
  if (typeof p.url !== 'string') return false;
  if (typeof p.page !== 'number') return false;
  if (typeof p.pageSize !== 'number') return false;
  if (p.sortOrder !== undefined && p.sortOrder !== 'asc' && p.sortOrder !== 'desc') return false;
  return true;
}
