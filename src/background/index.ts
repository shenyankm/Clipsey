import { addClip, clearClips, getClips } from './storage';
import { createId } from '@/utils/helpers';
import type { Clip } from '@/types/clip';

const CONTEXT_MENU_ID = 'page-clipper-context-menu';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Clip current selection',
    contexts: ['selection']
  });

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

  const tab = await chrome.tabs.create({ url: clip.sourceUrl });
  if (!tab?.id) {
    throw new Error('Unable to open tab for clip');
  }

  const tabId = tab.id;
  const scheduleHighlight = () => {
    if (!clip.textContent) {
      return;
    }

    void attemptHighlightClip(tabId, clip);
  };

  if (tab.status === 'complete') {
    setTimeout(scheduleHighlight, 300);
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
      setTimeout(scheduleHighlight, 300);
    }
  };

  chrome.tabs.onUpdated.addListener(listener);

  setTimeout(() => {
    if (chrome.tabs.onUpdated.hasListener(listener)) {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(scheduleHighlight, 500);
    }
  }, 15000);
}

async function requestSelection(tabId: number): Promise<void> {
  try {
    await sendMessageToTab(tabId, { type: 'REQUEST_SELECTION' });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectContentScript(tabId);
    await sendMessageToTab(tabId, { type: 'REQUEST_SELECTION' });
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

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['scripts/content.js']
  });
}

async function registerContentScript(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['page-clipper-selection'] });
  } catch (error) {
    if (!isNoSuchContentScriptError(error)) {
      throw error;
    }
  }

  await chrome.scripting.registerContentScripts([
    {
      id: 'page-clipper-selection',
      matches: ['<all_urls>'],
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

  return message.includes('Receiving end does not exist');
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

async function attemptHighlightClip(tabId: number, clip: Clip): Promise<void> {
  if (!clip.textContent) {
    return;
  }

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await sendMessageToTab(tabId, {
        type: 'HIGHLIGHT_CLIP',
        payload: {
          id: clip.id,
          textContent: clip.textContent
        }
      });

      if ((response as { success?: boolean })?.success) {
        return;
      }
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        console.warn('Failed to highlight clip', error);
        return;
      }
    }

    await delay(400);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}
