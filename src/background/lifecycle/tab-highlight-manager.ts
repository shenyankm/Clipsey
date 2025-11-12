import { browser } from 'wxt/browser';
import { getClipsForUrl } from '../storage';
import { ErrorHandler } from '@/utils/error-handler';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';
import { listenerManager } from './listener-cleanup';
import { permissionsService } from '@/background/services/permissions-service';
import { buildHighlightPayloads, sendHighlightsToTab, isAutoHighlightEnabled } from '@/background/utils/highlight-helpers';

const HIGHLIGHT_MAX_ATTEMPTS = 8;
const HIGHLIGHT_RETRY_DELAY_MS = 600;
const HIGHLIGHT_INITIAL_DELAY_MS = 800;

type TabUpdateListener = Parameters<typeof browser.tabs.onUpdated.addListener>[0];
type TabChangeInfo = TabUpdateListener extends (...args: infer Args) => any ? Args[1] : never;
type TabInfo = TabUpdateListener extends (...args: infer Args) => any ? Args[2] : never;

/** 标签页高亮：在页面加载完成后自动激活相关摘要的高亮。 */
export class TabHighlightManager {
  /** 处理标签页更新事件。 */
  async handleTabUpdate(tabId: number, changeInfo: TabChangeInfo, tab: TabInfo): Promise<void> {
    try {
      const url = tab?.url;
      if (!url || changeInfo.status !== 'complete') {
        return;
      }

      void this.activatePageHighlights(tabId, url);
    } catch (error) {
      const appError = ErrorHandler.handle(error, 'Tab update');
      console.warn(appError.userMessage);
    }
  }

  /** 注册标签页更新监听器。 */
  registerListener(): void {
    const listener: TabUpdateListener = (tabId, changeInfo, tab) => {
      void this.handleTabUpdate(tabId, changeInfo, tab);
    };

    browser.tabs.onUpdated.addListener(listener);

    listenerManager.addCleanup(() => {
      browser.tabs.onUpdated.removeListener(listener);
    });
  }

  /** 激活页面高亮。 */
  private async activatePageHighlights(tabId: number, url: string): Promise<void> {
    if (!isSupportedHttpUrl(url)) {
      return;
    }

    if (!(await isAutoHighlightEnabled())) {
      return;
    }

    const hasPermission = await permissionsService.hasHostPermissionForUrl(url);
    if (!hasPermission) {
      return;
    }

    const clips = await getClipsForUrl(url);
    if (!clips.length) {
      return;
    }

    const highlights = buildHighlightPayloads(clips);
    if (!highlights.length) {
      return;
    }

    await delay(HIGHLIGHT_INITIAL_DELAY_MS);

    for (let attempt = 0; attempt < HIGHLIGHT_MAX_ATTEMPTS; attempt += 1) {
      const success = await sendHighlightsToTab(tabId, highlights);
      if (success) {
        console.log(`[Highlight] Successfully activated highlights on attempt ${attempt + 1}`);
        return;
      }

      const delayMs = HIGHLIGHT_RETRY_DELAY_MS * (attempt + 1);
      console.log(`[Highlight] Retry ${attempt + 1}/${HIGHLIGHT_MAX_ATTEMPTS} after ${delayMs}ms`);
      await delay(delayMs);
    }

    console.warn(`[Highlight] Failed to activate highlights after ${HIGHLIGHT_MAX_ATTEMPTS} attempts`);
  }
}

export const tabHighlightManager = new TabHighlightManager();
