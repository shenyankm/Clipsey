import { addClip, clearClips, getClips } from './storage';
import { createId } from '@/utils/helpers';
import type { Clip } from '@/types/clip';

const CONTEXT_MENU_ID = 'clipsey-context-menu';
const CONTENT_SCRIPT_ID = 'clipsey-selection';
const CONTENT_MATCHES = ['https://*/*', 'http://*/*'];
const FOCUS_MAX_ATTEMPTS = 5;
const FOCUS_RETRY_DELAY_MS = 400;
const REQUEST_SELECTION_MAX_ATTEMPTS = 3;
const REQUEST_SELECTION_RETRY_DELAY_MS = 200;
const NOTIFICATION_ICON = chrome.runtime.getURL('assets/icon128.png');

type MessageResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

chrome.runtime.onInstalled.addListener(() => {
  // Clean up old context menu id from previous branding
  chrome.contextMenus.remove('page-clipper-context-menu', () => {
    const err = chrome.runtime.lastError;
    // ignore missing id errors
  });

  chrome.contextMenus.create(
    {
      id: CONTEXT_MENU_ID,
      title: 'Clip current selection',
      contexts: ['selection']
    },
    () => {
      const error = chrome.runtime.lastError;
      if (error && !error.message?.includes('duplicate id')) {
        console.error('Unable to create context menu', error);
      }
    }
  );

  registerContentScript().catch(error => {
    console.error('Failed to register content script', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  registerContentScript().catch(error => {
    console.error('Failed to register content script on startup', error);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
    return;
  }

  if (!info.selectionText || !info.selectionText.trim()) {
    void showNotification('Nothing to save', 'Select the text you want to clip and try again.');
    return;
  }

  requestSelection(tab.id).catch(error => {
    console.error('Failed to request selection', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'SAVE_CLIP':
      handleSaveClip(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'REQUEST_CLIPS':
      getClips()
        .then(clips => sendResponse({ success: true, data: clips }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'CLEAR_CLIPS':
      clearClips()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    case 'OPEN_CLIP':
      handleOpenClip(message?.payload?.id)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error?.message }));
      return true;
    default:
      break;
  }

  return false;
});

async function handleSaveClip(payload: Partial<Clip> & { textContent?: string }): Promise<void> {
  if (!payload?.textContent) {
    return;
  }

  const clip: Clip = {
    id: createId(),
    sourceUrl: payload.sourceUrl ?? '',
    title: payload.title,
    textContent: payload.textContent,
    htmlContent: payload.htmlContent,
    createdAt: new Date().toISOString()
  };

  await addClip(clip);
}

async function handleOpenClip(clipId?: string): Promise<void> {
  if (!clipId) {
    throw new Error('Missing clip id');
  }

  const clips = await getClips();
  const clip = clips.find(entry => entry.id === clipId);
  if (!clip) {
    throw new Error('Clip not found');
  }

  if (!clip.sourceUrl) {
    throw new Error('Clip does not have a source URL');
  }

  if (!isSupportedHttpUrl(clip.sourceUrl)) {
    throw new Error('Clip contains an unsupported URL');
  }

  const tab = await chrome.tabs.create({ url: clip.sourceUrl });
  if (!tab?.id) {
    throw new Error('Unable to open tab for clip');
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

  const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
    updatedTabId,
    changeInfo
  ) => {
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

async function requestSelection(tabId: number, attempt = 0): Promise<void> {
  try {
    const response = (await sendMessageToTab(tabId, {
      type: 'REQUEST_SELECTION'
    })) as MessageResponse;

    handleSelectionResponse(response);
  } catch (error) {
    if (isFrameRemovedError(error) && attempt < REQUEST_SELECTION_MAX_ATTEMPTS - 1) {
      await delay(REQUEST_SELECTION_RETRY_DELAY_MS * (attempt + 1));
      await requestSelection(tabId, attempt + 1);
      return;
    }

    if (!isMissingReceiverError(error)) {
      void showNotification('Clip failed', getErrorMessage(error));
      throw error;
    }

    const injected = await injectContentScript(tabId);
    if (!injected) {
      return;
    }

    try {
      const response = (await sendMessageToTab(tabId, {
        type: 'REQUEST_SELECTION'
      })) as MessageResponse;
      handleSelectionResponse(response);
    } catch (retryError) {
      if (isMissingReceiverError(retryError)) {
        void showNotification(
          'Clip failed',
          'Helper script is not available on this page.'
        );
        return;
      }

      void showNotification('Clip failed', getErrorMessage(retryError));
      throw retryError;
    }
  }
}

async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/content.js']
    });
    return true;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('Cannot access contents of url')) {
      void showNotification('Cannot access page', 'This page does not allow extension scripts.');
      return false;
    }

    throw error;
  }
}

async function registerContentScript(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID, 'page-clipper-selection'] });
  } catch (error) {
    if (!isNoSuchContentScriptError(error)) {
      throw error;
    }
  }

  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches: CONTENT_MATCHES,
      js: ['scripts/content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }
  ]);
}

function isMissingReceiverError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message;
  if (!message) {
    return false;
  }

  return message.includes('Receiving end does not exist') || isFrameRemovedError(error);
}

function isNoSuchContentScriptError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message;
  if (!message) {
    return false;
  }

  return message.includes('No such content script') || message.includes('Nonexistent script ID');
}

function isFrameRemovedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message?.toLowerCase();
  if (!message) {
    return false;
  }

  return message.includes('frame with id') && message.includes('removed');
}

async function attemptFocusClip(tabId: number, clip: Clip): Promise<void> {
  if (!clip.textContent) {
    return;
  }

  let attemptedManualInjection = false;

  for (let attempt = 0; attempt < FOCUS_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendMessageToTab(tabId, {
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
      if (isMissingReceiverError(error)) {
        if (!attemptedManualInjection) {
          attemptedManualInjection = true;
          try {
            const injected = await injectContentScript(tabId);
            if (!injected) {
              return;
            }
          } catch (injectionError) {
            console.warn('Failed to inject focus helper', injectionError);
            return;
          }
        }
      } else {
        console.warn('Failed to focus clip', error);
        return;
      }
    }

    await delay(FOCUS_RETRY_DELAY_MS);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function handleSelectionResponse(response: MessageResponse | undefined): void {
  if (!response) {
    void showNotification('Clip failed', 'Unknown error, please try again later.');
    return;
  }

  if (response.success) {
    void showNotification('Clip saved', 'Open the extension popup to view your clips.');
    return;
  }

  if (response.error?.includes('No selection')) {
    void showNotification('Nothing to save', 'Select the text you want to clip and try again.');
    return;
  }

  void showNotification('Clip failed', response.error ?? 'Unknown error, please try again later.');
}

function isSupportedHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? 'Unknown error');
  }

  return (
    (error as { message?: string; toString?: () => string }).message ??
    (error as { toString?: () => string }).toString?.() ??
    'Unknown error'
  );
}

async function showNotification(title: string, message: string): Promise<void> {
  if (!chrome.notifications?.create) {
    console.warn('Notifications API is not available.');
    return;
  }

  try {
    await chrome.notifications.create({
      type: 'basic',
      title,
      message,
      iconUrl: NOTIFICATION_ICON
    });
  } catch (error) {
    console.warn('Unable to show notification', error);
  }
}
