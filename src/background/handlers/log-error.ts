import { ErrorHandler } from '@/utils/error-handler';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { ErrorLogRecord } from '@/types/indexeddb';

type LogErrorPayload = {
  message?: string;
  context?: string;
  stack?: string;
};

const MAX_LOGS = 200; // 限制最大日志条数，避免存储膨胀

export async function handleLogError(payload: unknown): Promise<boolean> {
  const p = normalizePayload(payload);
  const entry: ErrorLogRecord = {
    id: crypto?.randomUUID?.() ?? `err-${Date.now()}`,
    time: new Date().toISOString(),
    message: p.message || '未知错误',
    context: p.context,
    stack: p.stack
  };

  try {
    // 初始化 IndexedDB
    await indexedDBManager.init();
    
    // 添加新日志
    await indexedDBManager.add('errorLogs', entry);
    
    // 检查是否超过最大条数，如超过则删除最旧的
    const count = await indexedDBManager.count('errorLogs');
    if (count > MAX_LOGS) {
      // 获取所有日志，按时间升序
      const allLogs = await IndexedDBQuery.getAll('errorLogs', {
        indexName: 'time',
        direction: 'next'
      });
      
      // 删除超出部分
      const toDelete = allLogs.slice(0, count - MAX_LOGS);
      for (const log of toDelete) {
        await indexedDBManager.delete('errorLogs', log.id);
      }
    }
    
    return true;
  } catch (error) {
    // 兰底：打印到控制台
    const handled = ErrorHandler.handle(error, 'Persist error log to IndexedDB');
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