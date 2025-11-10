import { ErrorHandler } from '@/utils/error-handler';

const CONTEXT_MENU_ID = 'clipsey-context-menu';
const SUPPORTED_DOCUMENT_URL_PATTERNS = ['http://*/*', 'https://*/*'];

/** 管理右键菜单并暴露菜单 ID 等辅助方法 */
export class ContextMenuManager {
  async create(): Promise<void> {
    await this.cleanupLegacyMenus();
    this.registerContextMenu();
  }

  getMenuId(): string {
    return CONTEXT_MENU_ID;
  }

  private async cleanupLegacyMenus(): Promise<void> {
    await Promise.all([
      this.removeMenuIfExists('page-clipper-context-menu'),
      this.removeMenuIfExists(CONTEXT_MENU_ID)
    ]);
  }

  private async removeMenuIfExists(menuId: string): Promise<void> {
    await new Promise<void>(resolve => {
      chrome.contextMenus.remove(menuId, () => {
        const error = chrome.runtime.lastError;
        if (error && error.message && !error.message.includes('Cannot find menu item')) {
          console.debug(`[ContextMenu] Failed to remove menu ${menuId}`, error);
        }
        resolve();
      });
    });
  }

  private registerContextMenu(): void {
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: '保存当前选中内容',
        contexts: ['selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS
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
}

// 导出单例
export const contextMenuManager = new ContextMenuManager();
