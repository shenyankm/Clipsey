import { browser } from 'wxt/browser';
import type { Clip } from '@/types/clip';
import type { HighlightPayload, MessageResponse } from '@/types/message';
import { contentScriptService } from '@/background/services/content-script-service';
import { readSettingsLocal, DEFAULT_SETTINGS, SETTINGS_LOCAL_KEY, type SettingsOptions } from '@/utils/settings-local';
import { listenerManager } from '@/background/lifecycle/listener-cleanup';

const autoHighlightState = {
  loaded: false,
  enabled: DEFAULT_SETTINGS.autoHighlightPageSummary
};

export async function isAutoHighlightEnabled(): Promise<boolean> {
  if (!autoHighlightState.loaded) {
    await refreshAutoHighlightSetting();
    autoHighlightState.loaded = true;
    registerSettingsListener();
  }
  return autoHighlightState.enabled;
}

async function refreshAutoHighlightSetting(): Promise<void> {
  try {
    const settings = await readSettingsLocal();
    autoHighlightState.enabled = Boolean(settings.autoHighlightPageSummary);
  } catch {
    autoHighlightState.enabled = DEFAULT_SETTINGS.autoHighlightPageSummary;
  }
}

function registerSettingsListener(): void {
  if (!browser.storage?.onChanged) return;
  const handler: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;
    const change = changes[SETTINGS_LOCAL_KEY];
    if (!change) return;
    const newValue = change.newValue as Partial<SettingsOptions> | undefined;
    if (newValue && typeof newValue.autoHighlightPageSummary === 'boolean') {
      autoHighlightState.enabled = newValue.autoHighlightPageSummary;
    } else if (!newValue) {
      autoHighlightState.enabled = DEFAULT_SETTINGS.autoHighlightPageSummary;
    }
  };

  browser.storage.onChanged.addListener(handler);
  listenerManager.addCleanup(() => {
    browser.storage?.onChanged?.removeListener(handler);
  });
}

export function buildHighlightPayloads(clips: Clip[]): HighlightPayload[] {
  const seen = new Set<string>();
  const highlights: HighlightPayload[] = [];

  for (const clip of clips) {
    const text = clip.textContent?.trim();
    if (!text) continue;
    const key = clip.highlightId ?? `${clip.sourceUrl}:${text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    highlights.push({
      id: clip.highlightId ?? clip.id,
      highlightId: clip.highlightId,
      textContent: text,
      contextBefore: clip.contextBefore,
      contextAfter: clip.contextAfter,
      anchorSelector: clip.anchorSelector,
      textOffset: clip.textOffset,
      highlightStyle: clip.highlightStyle
    });
  }

  return highlights;
}

export async function sendHighlightsToTab(tabId: number, highlights: HighlightPayload[]): Promise<boolean> {
  const sendRequest = async (): Promise<boolean> => {
    const response = await contentScriptService.sendMessageToTab<MessageResponse<unknown>>(tabId, {
      type: 'ACTIVATE_HIGHLIGHTS',
      payload: { highlights }
    });
    return Boolean(response?.success);
  };

  try {
    const success = await sendRequest();
    if (success) {
      return true;
    }

    const injected = await contentScriptService.injectContentScript(tabId);
    if (!injected) {
      return false;
    }
    return await sendRequest();
  } catch (error) {
    if (!contentScriptService.isMissingReceiverError(error)) {
      console.warn('[Highlight] Failed to send highlights:', error);
      return false;
    }

    const injected = await contentScriptService.injectContentScript(tabId);
    if (!injected) {
      return false;
    }

    try {
      return await sendRequest();
    } catch (retryError) {
      if (!contentScriptService.isMissingReceiverError(retryError)) {
        console.warn('[Highlight] Retry send highlights failed:', retryError);
      }
      return false;
    }
  }
}
