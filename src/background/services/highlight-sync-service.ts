/** 高亮同步服务：剪辑删除后刷新对应页面的高亮状态。 */
export class HighlightSyncService {
  // 刷新指定 URL 的页面高亮（用于剪辑删除后的同步）
  async refreshPageHighlights(url: string): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        
        if (this.urlsMatch(tab.url, url)) {
          await this.updateTabHighlights(tab.id, tab.url);
        }
      }
    } catch (error) {
      console.warn('[Highlight Sync] Failed to refresh page highlights:', error);
    }
  }

  // 更新标签页高亮：收集 URL 对应剪辑并通知页面激活
  private async updateTabHighlights(tabId: number, tabUrl: string): Promise<void> {
    try {
      const { getClipsForUrl } = await import('@/background/storage');
      const clips = await getClipsForUrl(tabUrl);
      
      const highlights = clips
        .filter(clip => clip.highlightId && clip.textContent)
        .map(clip => ({
          id: clip.highlightId ?? clip.id,
          highlightId: clip.highlightId,
          textContent: clip.textContent,
          contextBefore: clip.contextBefore,
          contextAfter: clip.contextAfter,
          anchorSelector: clip.anchorSelector,
          textOffset: clip.textOffset,
          highlightStyle: clip.highlightStyle
        }));
      
      await chrome.tabs.sendMessage(tabId, {
        type: 'ACTIVATE_HIGHLIGHTS',
        payload: { highlights }
      });
    } catch (error) {
      console.debug(`[Highlight Sync] Failed to update tab ${tabId}:`, error);
    }
  }

  // 比较两个 URL 是否匹配（忽略查询参数与 hash）
  private urlsMatch(url1: string, url2: string): boolean {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);
      return parsed1.origin === parsed2.origin && parsed1.pathname === parsed2.pathname;
    } catch {
      return false;
    }
  }
}

// 导出单例实例
export const highlightSyncService = new HighlightSyncService();
