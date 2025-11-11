import type { Clip } from '@/types/clip';
import { browser } from 'wxt/browser';

/** 数据变更监听回调。 */
type ChangeListener = (changes: any, areaName: string) => void;

/** 统一的同步消息结构 */
type SyncPayload = {
  type: 'CLIPS_CHANGED';
  timestamp: number;
  oldCount: number;
  newCount: number;
};

/** 同步管理器：使用 BroadcastChannel 跨页同步数据。 */
export class SyncManager {
  private changeListeners: ChangeListener[] = [];
  private syncChannel: BroadcastChannel | null = null;

  constructor() {
    this.initSyncChannel();
  }

  /** 初始化同步通道 */
  private initSyncChannel(): void {
    try {
      this.syncChannel = new BroadcastChannel('clipsey-storage-sync');
    } catch (error) {
      console.warn('[Sync Manager] BroadcastChannel not supported:', error);
    }
  }

  /** 添加变更监听 */
  addListener(callback: ChangeListener): void {
    this.changeListeners.push(callback);
  }

  /** 移除变更监听 */
  removeListener(callback: ChangeListener): void {
    const index = this.changeListeners.indexOf(callback);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /** 通知数据变更并同步到其他页面 */
  notifyChange(oldValue: Clip[], newValue: Clip[]): void {
    const changes = {
      clips: {
        oldValue,
        newValue
      }
    };
    
    if (import.meta.env.DEV) {
      console.log('[Storage Sync] Data changed:', {
        oldCount: oldValue.length,
        newCount: newValue.length,
        operation: newValue.length > oldValue.length ? 'ADD' : 
                   newValue.length < oldValue.length ? 'DELETE' : 'UPDATE',
        timestamp: new Date().toISOString()
      });
    }
    
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
    
    // 使用 BroadcastChannel + runtime 消息同步
    this.broadcastChange(oldValue, newValue);
  }

  /** 广播给前端页面。 */
  private broadcastChange(oldValue: Clip[], newValue: Clip[]): void {
    const payload: SyncPayload = {
      type: 'CLIPS_CHANGED',
      timestamp: Date.now(),
      oldCount: oldValue.length,
      newCount: newValue.length
    };

    if (this.syncChannel) {
      try {
        this.syncChannel.postMessage(payload);
        
        if (import.meta.env.DEV) {
          console.log('[Storage Sync] BroadcastChannel message sent successfully');
        }
      } catch (error) {
        console.error('[Storage Sync] Failed to send BroadcastChannel message:', error);
      }
    }

    this.sendRuntimeMessage(payload);
  }

  private sendRuntimeMessage(payload: SyncPayload): void {
    try {
      if (!browser.runtime?.sendMessage) {
        return;
      }
      void browser.runtime.sendMessage(payload).catch(() => {});
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Storage Sync] Runtime message broadcast failed:', error);
      }
    }
  }

  /** 关闭同步通道并释放资源 */
  close(): void {
    if (this.syncChannel) {
      this.syncChannel.close();
      this.syncChannel = null;
    }
    this.changeListeners = [];
  }
}

// 管理器单例
export const syncManager = new SyncManager();

// 复用数据的 storage API
export const storage = {
  onChanged: {
    addListener: (callback: ChangeListener) => syncManager.addListener(callback),
    removeListener: (callback: ChangeListener) => syncManager.removeListener(callback)
  }
};
