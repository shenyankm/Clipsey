export function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
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

export function isChromeExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}
