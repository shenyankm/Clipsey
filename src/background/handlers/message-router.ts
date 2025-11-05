import { handleSaveClip } from '@/background/handlers/save-clip';
import { handleRequestClips } from '@/background/handlers/request-clips';
import { handleClearClips } from '@/background/handlers/clear-clips';
import { handleOpenClip } from '@/background/handlers/open-clip';
import { handleRequestSettings } from '@/background/handlers/request-settings';

type RuntimeMessage = {
  type: string;
  payload?: unknown;
};

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    switch (message?.type) {
      case 'SAVE_CLIP':
        handleSaveClip(message.payload as any)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      case 'REQUEST_CLIPS':
        handleRequestClips()
          .then(clips => sendResponse({ success: true, data: clips }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      case 'REQUEST_SETTINGS':
        handleRequestSettings()
          .then(options => sendResponse({ success: true, data: options }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      case 'CLEAR_CLIPS':
        handleClearClips()
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      case 'OPEN_CLIP':
        handleOpenClip((message?.payload as { id?: string } | undefined)?.id)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: (error as Error).message }));
        return true;
      default:
        break;
    }

    return false;
  });
}