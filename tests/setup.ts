// Shared extension API setup for Node and jsdom test files.

import { vi } from 'vitest';

// 提供最小的 chrome.runtime.sendMessage 桩函数
// 便于 color-manager 或内容脚本调用不报错
// @ts-expect-error 测试环境下注入全局 chrome
global.chrome = {
  runtime: {
    lastError: null as unknown,
    sendMessage: vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
      // 模拟异步响应
      setTimeout(() => {
        callback?.({ ok: true });
      }, 0);
    })
  }
};

if (typeof window !== 'undefined') {
  await import('./setup-dom');
}
