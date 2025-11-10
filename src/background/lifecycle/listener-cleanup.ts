/** 监听器清理：统一管理清理函数，防止内存泄漏。 */
export class ListenerManager {
  private listeners: Set<() => void> = new Set();

  /** 添加清理函数。 */
  addCleanup(cleanup: () => void): void {
    this.listeners.add(cleanup);
  }

  /** 执行所有清理函数并清空注册。 */
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

  /** 移除指定清理函数。 */
  removeCleanup(cleanup: () => void): void {
    this.listeners.delete(cleanup);
  }

  /** 获取当前清理函数数量。 */
  get size(): number {
    return this.listeners.size;
  }
}

// 导出单例实例
export const listenerManager = new ListenerManager();
