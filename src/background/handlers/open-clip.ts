import type { Clip } from '@/types/clip';
import { clipService } from '@/background/services/clip-service';
import { contentScriptService } from '@/background/services/content-script-service';
import { delay, isSupportedHttpUrl } from '@/utils/helpers';

const FOCUS_MAX_ATTEMPTS = 5;
const FOCUS_RETRY_DELAY_MS = 400;

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
    throw new Error('剪辑包含不支持的链接');
  }

  // 获取当前活动标签页
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    throw new Error('无法获取当前标签页');
  }

  const tabId = activeTab.id;
  const currentUrl = activeTab.url || '';
  
  // 检查当前标签页是否已经在目标页面
  const isSamePage = isSamePageUrl(currentUrl, clip.sourceUrl);
  
  if (isSamePage) {
    // 已在目标页面，直接定位到内容
    if (clip.textContent) {
      void attemptFocusClip(tabId, clip);
    }
  } else {
    // 需要导航到目标页面，在当前标签页中跳转
    await chrome.tabs.update(tabId, { url: clip.sourceUrl });
    
    // 等待页面加载完成后定位
    const scheduleFocus = () => {
      if (!clip.textContent) {
        return;
      }
      void attemptFocusClip(tabId, clip);
    };

    // 监听标签页更新事件
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

    // 超时保护，15秒后强制执行
    setTimeout(() => {
      if (chrome.tabs.onUpdated.hasListener(listener)) {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(scheduleFocus, 500);
      }
    }, 15000);
  }
}

/**
 * 判断两个URL是否指向同一页面（比较协议、主机名和路径）
 */
function isSamePageUrl(url1: string, url2: string): boolean {
  try {
    const parsed1 = new URL(url1);
    const parsed2 = new URL(url2);
    return (
      parsed1.protocol === parsed2.protocol &&
      parsed1.hostname === parsed2.hostname &&
      parsed1.pathname === parsed2.pathname
    );
  } catch {
    return false;
  }
}

async function attemptFocusClip(tabId: number, clip: Clip): Promise<void> {
  if (!clip.textContent) {
    return;
  }

  // 检查标签页是否仍然存在
  try {
    await chrome.tabs.get(tabId);
  } catch (error) {
    // 标签页已关闭或不存在，静默返回
    return;
  }

  let attemptedManualInjection = false;
  for (let attempt = 0; attempt < FOCUS_MAX_ATTEMPTS; attempt += 1) {
    // 每次尝试前检查标签页是否仍然存在
    try {
      await chrome.tabs.get(tabId);
    } catch (error) {
      // 标签页已关闭，停止尝试
      return;
    }

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