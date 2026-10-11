import { browser } from 'wxt/browser';
import { cacheManager } from './cache-manager';

/** 统一的同步消息结构 */
type SyncPayload = {
  type: 'CLIPS_CHANGED';
  timestamp: number;
  countDelta?: number;
};

/** 同步管理器：使用 BroadcastChannel 跨页同步数据。 */
export class SyncManager {
  private syncChannel: BroadcastChannel | null = null;
  private runtimeListener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = message => {
    if (message?.type === 'CLIPS_CHANGED') cacheManager.clear();
  };

  constructor() {
    this.initSyncChannel();
    browser.runtime?.onMessage?.addListener(this.runtimeListener);
  }

  /** 初始化同步通道 */
  private initSyncChannel(): void {
    try {
      this.syncChannel = new BroadcastChannel('clipsey-storage-sync');
      this.syncChannel.onmessage = event => {
        if (event.data?.type === 'CLIPS_CHANGED') cacheManager.clear();
      };
    } catch (error) {
      console.warn('[Sync Manager] BroadcastChannel not supported:', error);
    }
  }

  /** undefined 表示全部替换；单条写入只广播数量增量。 */
  notifyChange(countDelta?: number): void {
    const payload: SyncPayload = {
      type: 'CLIPS_CHANGED',
      timestamp: Date.now(),
      countDelta
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
    browser.runtime?.onMessage?.removeListener(this.runtimeListener);
    if (this.syncChannel) {
      this.syncChannel.close();
      this.syncChannel = null;
    }
  }
}

// 管理器单例
export const syncManager = new SyncManager();
