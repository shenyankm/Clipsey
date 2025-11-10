import { onMounted, onBeforeUnmount } from 'vue';

export interface SyncMessage {
  type: 'CLIPS_CHANGED';
  timestamp: number;
  oldCount?: number;
  newCount?: number;
}

/** 页面间同步：通过 BroadcastChannel 监听剪辑变更并回调处理。 */
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
