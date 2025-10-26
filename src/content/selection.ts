import type { Clip } from '@/types/clip';

declare global {
  interface Window {
    __PAGE_CLIPPER_CONTENT_INITIALIZED__?: boolean;
  }
}

if (!window.__PAGE_CLIPPER_CONTENT_INITIALIZED__) {
  window.__PAGE_CLIPPER_CONTENT_INITIALIZED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REQUEST_SELECTION') {
      return;
    }

    const selection = window.getSelection();
    const textContent = selection?.toString().trim();

    if (!textContent) {
      sendResponse({ success: false, error: 'No selection' });
      return;
    }

    const payload: Partial<Clip> = {
      textContent,
      htmlContent: extractSelectionHtml(selection),
      sourceUrl: window.location.href,
      title: document.title
    };

    sendMessage({ type: 'SAVE_CLIP', payload })
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error?.message }));

    return true;
  });
}

function extractSelectionHtml(selection: Selection | null): string | undefined {
  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i += 1) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }

  // Using innerHTML keeps original markup where possible.
  return container.innerHTML || undefined;
}

function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}
