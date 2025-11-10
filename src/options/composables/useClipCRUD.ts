import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { deleteClipById } from '@/background/api';
import { sendMessage } from '@/utils/chrome';
import type { Clip } from '@/types/clip';
import type { MessageResponse } from '@/types/message';
import { ErrorHandler } from '@/utils/error-handler';

/** 剪辑 CRUD 组合：封装剪辑的增删改查操作。 */
export function useClipCRUD() {
  const isDeleting = ref(false);
  const isOpening = ref(false);

  // 删除剪辑
  async function deleteClip(id: string): Promise<boolean> {
    if (isDeleting.value) return false;

    isDeleting.value = true;
    try {
      await deleteClipById(id);
      message.success('删除成功');
      return true;
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Delete clip');
      message.error(appError.userMessage || '删除失败');
      return false;
    } finally {
      isDeleting.value = false;
    }
  }

  // 打开剪辑（跳转到源页面并高亮）
  async function openClip(id: string): Promise<boolean> {
    if (isOpening.value) return false;

    isOpening.value = true;
    try {
      const response = await sendMessage<MessageResponse>({
        type: 'OPEN_CLIP',
        payload: { id }
      });

      if (!response?.success) {
        throw new Error(response?.error ?? '无法打开剪辑');
      }

      return true;
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Open clip');
      message.error(appError.userMessage || '打开失败');
      return false;
    } finally {
      isOpening.value = false;
    }
  }

  // 查看剪辑详情
  function viewClipDetail(clip: Clip): Clip {
    return clip;
  }

  return {
    isDeleting,
    isOpening,
    deleteClip,
    openClip,
    viewClipDetail
  };
}
