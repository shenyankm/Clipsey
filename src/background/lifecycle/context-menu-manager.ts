import { ErrorHandler } from '@/utils/error-handler';

const CONTEXT_MENU_ID = 'clipsey-context-menu';

/**
 * 上下文菜单管理器
 * 负责创建和管理Chrome扩展的右键菜单
 */
export class ContextMenuManager {
  /**
   * 创建上下文菜单
   */
  async create(): Promise<void> {
    // 清理旧版本遗留的上下文菜单标识
    chrome.contextMenus.remove('page-clipper-context-menu', () => {
      const removalError = chrome.runtime.lastError;
      if (removalError && removalError.message && !removalError.message.includes('Cannot find menu item')) {
        console.debug('移除旧上下文菜单时的非致命错误', removalError);
      }
    });

    // 创建新的上下文菜单
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: '保存当前选中内容',
        contexts: ['selection']
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error && !error.message?.includes('duplicate id')) {
          const appError = ErrorHandler.handle(error, 'Context menu creation');
          console.error(appError.userMessage);
        }
      }
    );
  }

  /**
   * 获取上下文菜单ID
   */
  getMenuId(): string {
    return CONTEXT_MENU_ID;
  }
}

// 导出单例实例
export const contextMenuManager = new ContextMenuManager();
