/**
 * 清理工具 - 用于释放资源和防止内存泄漏
 */

export class CleanupManager {
  private cleanupFunctions: Set<() => void> = new Set();
  private timers: Set<number> = new Set();
  private intervals: Set<number> = new Set();

  /**
   * 注册清理函数
   */
  register(cleanup: () => void): void {
    this.cleanupFunctions.add(cleanup);
  }

  /**
   * 取消注册清理函数
   */
  unregister(cleanup: () => void): void {
    this.cleanupFunctions.delete(cleanup);
  }

  /**
   * 注册定时器
   */
  setTimeout(callback: () => void, delay: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, delay);
    this.timers.add(id);
    return id;
  }

  /**
   * 注册间隔定时器
   */
  setInterval(callback: () => void, delay: number): number {
    const id = window.setInterval(callback, delay);
    this.intervals.add(id);
    return id;
  }

  /**
   * 清除定时器
   */
  clearTimeout(id: number): void {
    window.clearTimeout(id);
    this.timers.delete(id);
  }

  /**
   * 清除间隔定时器
   */
  clearInterval(id: number): void {
    window.clearInterval(id);
    this.intervals.delete(id);
  }

  /**
   * 执行所有清理操作
   */
  cleanup(): void {
    // 清理定时器
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers.clear();

    // 清理间隔定时器
    for (const id of this.intervals) {
      window.clearInterval(id);
    }
    this.intervals.clear();

    // 执行所有注册的清理函数
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (error) {
        console.error('Cleanup function error:', error);
      }
    }
    this.cleanupFunctions.clear();
  }

  /**
   * 获取当前资源使用情况
   */
  getStats(): {
    cleanupFunctions: number;
    timers: number;
    intervals: number;
  } {
    return {
      cleanupFunctions: this.cleanupFunctions.size,
      timers: this.timers.size,
      intervals: this.intervals.size,
    };
  }
}

/**
 * 全局清理管理器实例
 */
export const globalCleanupManager = new CleanupManager();

/**
 * 在窗口卸载时自动清理
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalCleanupManager.cleanup();
  });
}
