import { onMounted, onBeforeUnmount } from 'vue';
import { browser } from 'wxt/browser';

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
  let runtimeListener:
    | Parameters<typeof browser.runtime.onMessage.addListener>[0]
    | null = null;

  const handleSyncMessage = (payload: SyncMessage | undefined) => {
    if (payload?.type === 'CLIPS_CHANGED') {
      onMessage(payload);
    }
  };

  const registerRuntimeFallback = () => {
    try {
      if (!browser.runtime?.onMessage) {
        return;
      }
      runtimeListener = (message: unknown) => {
        handleSyncMessage(message as SyncMessage | undefined);
      };
      browser.runtime.onMessage.addListener(runtimeListener);
      if (import.meta.env.DEV) {
        console.warn('[BroadcastSync] BroadcastChannel unavailable, falling back to runtime messages');
      }
    } catch (error) {
      console.warn('[BroadcastSync] Runtime message fallback unavailable:', error);
    }
  };
  
  onMounted(() => {
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        handleSyncMessage(event.data);
      };
      
      if (import.meta.env.DEV) {
        console.log(`[BroadcastSync] Listener registered for ${channelName}`);
      }
    } catch (error) {
      console.warn('[BroadcastSync] Not supported:', error);
      registerRuntimeFallback();
    }
  });
  
  onBeforeUnmount(() => {
    if (channel) {
      channel.close();
      channel = null;
    }
    if (runtimeListener && browser.runtime?.onMessage) {
      try {
        browser.runtime.onMessage.removeListener(runtimeListener);
      } catch {
        // ignore
      }
      runtimeListener = null;
    }
  });
  
  return { channel };
}
