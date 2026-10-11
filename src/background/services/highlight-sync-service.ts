import { browser } from 'wxt/browser';
import { permissionsService } from '@/background/services/permissions-service';
import { contentScriptService } from '@/background/services/content-script-service';

/** 删除高亮不依赖自动高亮设置，也不重新激活其他摘录。 */
export class HighlightSyncService {
  async removePageHighlight(url: string, highlightId: string): Promise<void> {
    try {
      const source = new URL(url);
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined || !tab.url) continue;
        const target = new URL(tab.url);
        if (source.origin !== target.origin || source.pathname !== target.pathname) continue;
        if (!(await permissionsService.hasHostPermissionForUrl(tab.url))) continue;
        try {
          await contentScriptService.sendMessageToTab(tab.id, {
            type: 'REMOVE_HIGHLIGHT',
            payload: { highlightId }
          });
        } catch (error) {
          console.debug(`[Highlight Sync] Failed to update tab ${tab.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('[Highlight Sync] Failed to remove page highlight:', error);
    }
  }
}

export const highlightSyncService = new HighlightSyncService();
