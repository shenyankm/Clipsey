import { onMounted, onBeforeUnmount } from 'vue';

export interface SyncMessage {
  type: 'CLIPS_CHANGED';
  timestamp: number;
  oldCount?: number;
  newCount?: number;
}

/**
 * BroadcastChannel同步组合式函数
 * 统一管理跨页面的数据同步逻辑
 * 
 * @param channelName - BroadcastChannel频道名称
 * @param onMessage - 接收到消息时的回调函数
 */
export function useBroadcastSync(
  channelName: string,
  onMessage: (data: SyncMessage) => void
) {
  let channel: BroadcastChannel | null = null;
  
  onMounted(() => {
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        if (event.data?.type === 'CLIPS_CHANGED') {
          onMessage(event.data);
        }
      };
      
      if (import.meta.env.DEV) {
        console.log(`[BroadcastSync] Listener registered for ${channelName}`);
      }
    } catch (error) {
      console.warn('[BroadcastSync] Not supported:', error);
    }
  });
  
  onBeforeUnmount(() => {
    if (channel) {
      channel.close();
      channel = null;
    }
  });
  
  return { channel };
}
