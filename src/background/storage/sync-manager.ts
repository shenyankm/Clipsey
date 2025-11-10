import type { Clip } from '@/types/clip';

/** 数据变更监听器类型。 */
type ChangeListener = (changes: any, areaName: string) => void;

/** 同步管理器：使用 BroadcastChannel 跨页面同步剪辑数据。 */
export class SyncManager {
  private changeListeners: ChangeListener[] = [];
  private syncChannel: BroadcastChannel | null = null;

  constructor() {
    this.initSyncChannel();
  }

  /** 初始化同步通道。 */
  private initSyncChannel(): void {
    try {
      this.syncChannel = new BroadcastChannel('clipsey-storage-sync');
    } catch (error) {
      console.warn('[Sync Manager] BroadcastChannel not supported:', error);
    }
  }

  /** 添加变更监听器。 */
  addListener(callback: ChangeListener): void {
    this.changeListeners.push(callback);
  }

  /** 移除变更监听器。 */
  removeListener(callback: ChangeListener): void {
    const index = this.changeListeners.indexOf(callback);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /** 通知数据变更并触发跨页面同步。 */
  notifyChange(oldValue: Clip[], newValue: Clip[]): void {
    const changes = {
      clips: {
        oldValue,
        newValue
      }
    };
    
    // 记录变化详情（仅在开发模式下）
    if (import.meta.env.DEV) {
      console.log('[Storage Sync] Data changed:', {
        oldCount: oldValue.length,
        newCount: newValue.length,
        operation: newValue.length > oldValue.length ? 'ADD' : 
                   newValue.length < oldValue.length ? 'DELETE' : 'UPDATE',
        timestamp: new Date().toISOString()
      });
    }
    
    // 触发自定义监听器
    let customListenerCount = 0;
    this.changeListeners.forEach(listener => {
      try {
        listener(changes, 'local');
        customListenerCount++;
      } catch (error) {
        console.error('[Storage Sync] Custom listener error:', error);
      }
    });
    
    if (import.meta.env.DEV && customListenerCount > 0) {
      console.log(`[Storage Sync] Notified ${customListenerCount} custom listener(s)`);
    }
    
    // 使用 BroadcastChannel 实现跨页面同步
    this.broadcastChange(oldValue, newValue);
  }

  /** 广播变更到其他页面。 */
  private broadcastChange(oldValue: Clip[], newValue: Clip[]): void {
    if (!this.syncChannel) return;

    try {
      this.syncChannel.postMessage({
        type: 'CLIPS_CHANGED',
        timestamp: Date.now(),
        oldCount: oldValue.length,
        newCount: newValue.length
      });
      
      if (import.meta.env.DEV) {
        console.log('[Storage Sync] BroadcastChannel message sent successfully');
      }
    } catch (error) {
      console.error('[Storage Sync] Failed to send BroadcastChannel message:', error);
    }
  }

  /** 关闭同步管理器并清理资源。 */
  close(): void {
    if (this.syncChannel) {
      this.syncChannel.close();
      this.syncChannel = null;
    }
    this.changeListeners = [];
  }
}

// 导出单例实例
export const syncManager = new SyncManager();

// 导出兼容的storage API
export const storage = {
  onChanged: {
    addListener: (callback: ChangeListener) => syncManager.addListener(callback),
    removeListener: (callback: ChangeListener) => syncManager.removeListener(callback)
  }
};
