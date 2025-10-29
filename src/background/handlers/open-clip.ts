import type { Clip } from '@/types/clip';
import { clipService } from '@/background/services/clip-service';
import { contentScriptService } from '@/background/services/content-script-service';
import { delay } from '@/utils/helpers';

const FOCUS_MAX_ATTEMPTS = 5;
const FOCUS_RETRY_DELAY_MS = 400;

function isSupportedHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function handleOpenClip(clipId?: string): Promise<void> {
  if (!clipId) {
    throw new Error('缺少剪辑 ID');
  }

  const clips = await clipService.listAll();
  const clip = clips.find(entry => entry.id === clipId);
  if (!clip) {
    throw new Error('未找到剪辑');
  }

  if (!clip.sourceUrl) {
    throw new Error('该剪辑没有来源链接');
  }

  if (!isSupportedHttpUrl(clip.sourceUrl)) {
    throw new Error('剪辑包含不受支持的链接');
  }

  const tab = await chrome.tabs.create({ url: clip.sourceUrl });
  if (!tab?.id) {
    throw new Error('无法打开剪辑页面');
  }

  const tabId = tab.id;
  const scheduleFocus = () => {
    if (!clip.textContent) {
      return;
    }
    void attemptFocusClip(tabId, clip);
  };

  if (tab.status === 'complete') {
    setTimeout(scheduleFocus, 300);
    return;
  }

  const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId) {
      return;
    }
    if (changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(scheduleFocus, 300);
    }
  };

  chrome.tabs.onUpdated.addListener(listener);

  setTimeout(() => {
    if (chrome.tabs.onUpdated.hasListener(listener)) {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(scheduleFocus, 500);
    }
  }, 15000);
}

async function attemptFocusClip(tabId: number, clip: Clip): Promise<void> {
  if (!clip.textContent) {
    return;
  }

  let attemptedManualInjection = false;
  for (let attempt = 0; attempt < FOCUS_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await contentScriptService.sendMessageToTab(tabId, {
        type: 'FOCUS_CLIP',
        payload: {
          id: clip.id,
          textContent: clip.textContent
        }
      });
      if ((response as { success?: boolean })?.success) {
        return;
      }
    } catch (error) {
      if (contentScriptService.isMissingReceiverError(error)) {
        if (!attemptedManualInjection) {
          attemptedManualInjection = true;
          try {
            const injected = await contentScriptService.injectContentScript(tabId);
            if (!injected) {
              return;
            }
          } catch (injectionError) {
            console.warn('注入辅助脚本失败', injectionError);
            return;
          }
        }
      } else {
        console.warn('定位剪辑失败', error);
        return;
      }
    }
    await delay(FOCUS_RETRY_DELAY_MS);
  }
}