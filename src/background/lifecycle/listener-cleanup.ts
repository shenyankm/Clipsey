/**
 * 监听器清理管理器
 * 防止内存泄漏,统一管理所有监听器的清理函数
 */
export class ListenerManager {
  private listeners: Set<() => void> = new Set();

  /**
   * 添加清理函数
   */
  addCleanup(cleanup: () => void): void {
    this.listeners.add(cleanup);
  }

  /**
   * 执行所有清理函数
   */
  cleanup(): void {
    for (const cleanup of this.listeners) {
      try {
        cleanup();
      } catch (error) {
        console.error('[Listener Cleanup] Error:', error);
      }
    }
    this.listeners.clear();
  }

  /**
   * 移除特定的清理函数
   */
  removeCleanup(cleanup: () => void): void {
    this.listeners.delete(cleanup);
  }

  /**
   * 获取当前注册的清理函数数量
   */
  get size(): number {
    return this.listeners.size;
  }
}

// 导出单例实例
export const listenerManager = new ListenerManager();
