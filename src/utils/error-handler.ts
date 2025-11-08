/**
 * 统一错误处理器 - 集中管理所有错误的捕获、日志和用户提示
 */

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  originalError?: Error;
  context?: string;
}

export class ErrorHandler {
  private static logErrors = true;

  /**
   * 统一错误处理入口
   */
  static handle(error: unknown, context?: string): AppError {
    const appError = this.parseError(error, context);
    
    if (this.logErrors) {
      this.logError(appError);
    }
    
    return appError;
  }

  /**
   * 解析错误对象
   */
  private static parseError(error: unknown, context?: string): AppError {
    if (this.isAppError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return this.createAppError(error, context);
    }

    if (typeof error === 'string') {
      return {
        code: ErrorCode.UNKNOWN_ERROR,
        message: error,
        userMessage: error,
        context,
      };
    }

    return {
      code: ErrorCode.UNKNOWN_ERROR,
      message: String(error),
      userMessage: '发生未知错误',
      context,
    };
  }

  /**
   * 创建应用错误对象
   */
  private static createAppError(error: Error, context?: string): AppError {
    const message = error.message || '未知错误';
    let code = ErrorCode.UNKNOWN_ERROR;
    let userMessage = '操作失败，请稍后重试';

    // 根据错误消息判断错误类型
    if (this.isNetworkError(message)) {
      code = ErrorCode.NETWORK_ERROR;
      userMessage = '网络连接失败，请检查网络后重试';
    } else if (this.isPermissionError(message)) {
      code = ErrorCode.PERMISSION_ERROR;
      userMessage = '此页面不允许扩展运行';
    } else if (this.isStorageError(message)) {
      code = ErrorCode.STORAGE_ERROR;
      userMessage = '数据存储失败，请稍后重试';
    }

    return {
      code,
      message,
      userMessage,
      originalError: error,
      context,
    };
  }

  /**
   * 记录错误日志
   */
  private static logError(error: AppError): void {
    const logMessage = [
      `[${error.code}]`,
      error.context ? `[${error.context}]` : '',
      error.message,
    ].filter(Boolean).join(' ');

    console.error(logMessage, error.originalError);
  }

  /**
   * 判断是否为应用错误对象
   */
  private static isAppError(error: unknown): error is AppError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'userMessage' in error
    );
  }

  /**
   * 判断是否为网络错误
   */
  private static isNetworkError(message: string): boolean {
    const networkKeywords = [
      'fetch',
      'network',
      'timeout',
      'connection',
    ];
    const lowerMessage = message.toLowerCase();
    return networkKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * 判断是否为权限错误
   */
  private static isPermissionError(message: string): boolean {
    const permissionKeywords = [
      'cannot access',
      'permission',
      'chrome://',
      'receiving end does not exist',
      'no tab with id',
      // Chrome 脚本注册/注入相关错误
      'no such content script',
      'nonexistent script id',
      'duplicate script id',
      'frame with id',
      'removed',
    ];
    const lowerMessage = message.toLowerCase();
    return permissionKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * 判断是否为存储错误
   */
  private static isStorageError(message: string): boolean {
    const storageKeywords = [
      'storage',
      'indexeddb',
      'quota',
      'database',
    ];
    const lowerMessage = message.toLowerCase();
    return storageKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * 从错误对象中提取消息
   */
  static getErrorMessage(error: unknown): string {
    if (!error) {
      return '未知错误';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message) || '未知错误';
    }

    if (typeof error === 'object' && 'toString' in error) {
      const toString = (error as { toString: () => string }).toString;
      if (typeof toString === 'function') {
        return toString() || '未知错误';
      }
    }

    return String(error);
  }

  /**
   * 包装异步函数，自动处理错误
   */
  static async wrap<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await fn();
      return { data };
    } catch (error) {
      return { error: this.handle(error, context) };
    }
  }

  /**
   * 设置是否记录错误日志
   */
  static setLogErrors(enabled: boolean): void {
    this.logErrors = enabled;
  }
}

/**
 * 类型守卫函数
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isChromeRuntimeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = (error as { message?: string }).message;
  return Boolean(message && typeof message === 'string');
}
