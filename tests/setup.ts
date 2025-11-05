// Minimal chrome mock for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = {
  runtime: {
    onMessage: {
      addListener: () => {},
      removeListener: () => {}
    },
    lastError: undefined,
    sendMessage: (_message: unknown, callback: (response: unknown) => void) => {
      // 默认返回空设置，避免测试失败
      callback({ success: true, data: {} });
    }
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