import { browser } from 'wxt/browser';
import { ErrorHandler } from '@/utils/error-handler';

const CONTEXT_MENU_ID = 'clipsey-context-menu';
const SUPPORTED_DOCUMENT_URL_PATTERNS = ['http://*/*', 'https://*/*'];

/** 负责右键菜单的创建与清理 */
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
    try {
      await browser.contextMenus.remove(menuId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message && !message.includes('Cannot find menu item')) {
        console.debug(`[ContextMenu] Failed to remove menu ${menuId}`, error);
      }
    }
  }

  private registerContextMenu(): void {
    try {
      browser.contextMenus.create(
        {
          id: CONTEXT_MENU_ID,
          title: '保存当前选中内容',
          contexts: ['selection'],
          documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS
        },
        () => {
          // 创建完成回调
          if (browser.runtime.lastError) {
            const appError = ErrorHandler.handle(
              new Error(browser.runtime.lastError.message),
              'Context menu creation'
            );
            console.error(appError.userMessage);
          }
        }
      );
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Context menu creation');
      console.error(appError.userMessage);
    }
  }
}

// 单例导出
export const contextMenuManager = new ContextMenuManager();
