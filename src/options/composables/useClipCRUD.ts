import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { deleteClipById } from '@/background/api';
import type { Clip } from '@/types/clip';
import { ErrorHandler } from '@/utils/error-handler';
import { useClipOpener } from '@/utils/clip/opener';

/** 剪辑 CRUD 组合：封装剪辑的增删改查操作。 */
export function useClipCRUD() {
  const isDeleting = ref(false);
  const { openingId, openClip } = useClipOpener();

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

  // 查看剪辑详情
  function viewClipDetail(clip: Clip): Clip {
    return clip;
  }

  return {
    isDeleting,
    openingId,
    deleteClip,
    openClip,
    viewClipDetail
  };
}
