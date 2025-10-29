// Minimal chrome mock for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = {
  runtime: {
    onMessage: {
      addListener: () => {},
      removeListener: () => {}
    },
    lastError: undefined
  },
  tabs: {
    sendMessage: (_tabId: number, _message: unknown, callback: (response: unknown) => void) => {
      callback({});
    }
  },
  scripting: {
    registerContentScripts: async () => {},
    unregisterContentScripts: async () => {},
    executeScript: async () => {}
  },
  notifications: {
    create: async () => {}
  }
};