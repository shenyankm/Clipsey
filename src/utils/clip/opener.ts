import { ref } from 'vue';
import { message } from 'ant-design-vue';
import type { Clip } from '@/types/clip';
import { sendMessage } from '@/utils/chrome';
import { ErrorHandler } from '@/utils/error-handler';
import type { MessageResponse } from '@/types/message';

export function useClipOpener(closeWindow = false) {
  const openingId = ref<string | null>(null);

  async function openClip(clip: Clip): Promise<void> {
    if (openingId.value || !clip.sourceUrl) {
      if (!clip.sourceUrl) {
        message.warning('暂无可用的来源链接');
      }
      return;
    }

    openingId.value = clip.id;
    try {
      const response = await sendMessage<MessageResponse>({
        type: 'OPEN_CLIP',
        payload: { id: clip.id }
      });
      if (!response?.success) {
        throw new Error(response?.error ?? '无法打开剪辑');
      }
      if (closeWindow) {
        window.close();
      }
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Open clip');
      message.error(appError.userMessage);
    } finally {
      openingId.value = null;
    }
  }

  return {
    openingId,
    openClip
  };
}
