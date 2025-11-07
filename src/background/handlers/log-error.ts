import { ErrorHandler } from '@/utils/error-handler';

type LogErrorPayload = {
  message?: string;
  context?: string;
  stack?: string;
};

type StoredError = {
  id: string;
  time: string; // ISO 格式时间
  message: string;
  context?: string;
  stack?: string;
};

const MAX_LOGS = 200; // 限制最大日志条数，避免存储膨胀

export async function handleLogError(payload: unknown): Promise<boolean> {
  const p = normalizePayload(payload);
  const entry: StoredError = {
    id: crypto?.randomUUID?.() ?? `err-${Date.now()}`,
    time: new Date().toISOString(),
    message: p.message || '未知错误',
    context: p.context,
    stack: p.stack
  };

  try {
    const current = await chrome.storage.local.get('errorLogs');
    const logs: StoredError[] = Array.isArray(current?.errorLogs) ? current.errorLogs : [];
    logs.push(entry);
    while (logs.length > MAX_LOGS) logs.shift();
    await chrome.storage.local.set({ errorLogs: logs });
    return true;
  } catch (error) {
    // 兜底：打印到控制台
    const handled = ErrorHandler.handle(error, 'Persist error log');
    console.error('[Clipsey] Persist error log failed:', handled.message);
    return false;
  }
}

function normalizePayload(payload: unknown): LogErrorPayload {
  if (payload && typeof payload === 'object') {
    const p = payload as LogErrorPayload;
    const message = typeof p.message === 'string' ? p.message : extractMessage(payload);
    const context = typeof p.context === 'string' ? p.context : undefined;
    const stack = typeof p.stack === 'string' ? p.stack : undefined;
    return { message, context, stack };
  }
  return { message: extractMessage(payload) };
}

function extractMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = (error as { message?: unknown }).message;
    if (typeof maybe === 'string' && maybe) return maybe;
    const toString = (error as { toString?: () => string }).toString;
    if (typeof toString === 'function') {
      const s = toString();
      if (s) return s;
    }
  }
  try { return JSON.stringify(error); } catch { return String(error); }
}