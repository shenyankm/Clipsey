import type { MessageResponse } from '@/types/message';
import { ErrorHandler } from '@/utils/error-handler';

/**
 * 统一的响应封装工具
 */
export class ResponseBuilder {
  /**
   * 构建成功响应
   */
  static success<T = void>(data?: T): MessageResponse<T> {
    return {
      success: true,
      ...(data !== undefined && { data })
    } as MessageResponse<T>;
  }

  /**
   * 构建错误响应
   */
  static error<T = void>(error: unknown, context?: string): MessageResponse<T> {
    const appError = ErrorHandler.handle(error, context);
    return {
      success: false,
      error: appError.userMessage
    } as MessageResponse<T>;
  }

  /**
   * 构建验证失败响应
   */
  static validationError(message: string): MessageResponse {
    return {
      success: false,
      error: message
    };
  }
}

/**
 * 包装异步处理器，自动处理响应和错误
 */
export function wrapHandler<T = void>(
  handler: () => Promise<T>,
  context?: string
): Promise<MessageResponse<T>> {
  return handler()
    .then(result => ResponseBuilder.success(result))
    .catch(error => ResponseBuilder.error<T>(error, context));
}
