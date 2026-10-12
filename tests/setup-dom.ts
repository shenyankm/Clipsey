// DOM setup is loaded only for jsdom test files.

import { vi } from 'vitest';

// 提供 window.scrollTo 桩，避免 jsdom 环境下报错
if (typeof window.scrollTo !== 'function') {
  // @ts-expect-error jsdom 环境下不存在 scrollTo
  window.scrollTo = vi.fn();
}

// 提供 window.getSelection 的基本实现（jsdom 已内置，但这里确保存在）
if (typeof window.getSelection !== 'function') {
  // @ts-expect-error jsdom 环境下可能不存在 getSelection
  window.getSelection = () => ({
    removeAllRanges: () => {},
    rangeCount: 0,
    getRangeAt: (_index: number) => {
      const range = document.createRange();
      range.setStart(document.body, 0);
      range.setEnd(document.body, 0);
      return range;
    }
  });
}

// 提供 window.find 的空实现，避免被意外调用时报错
// @ts-expect-error jsdom 环境下不存在 window.find
window.find = window.find || vi.fn(() => false);

// 统一设置基础文档结构
document.body.innerHTML = '';

// 在 jsdom 环境下补充 Range 的布局测量方法，便于覆盖层测试
// @ts-expect-error jsdom 可能缺少这些方法
if (typeof (globalThis as any).Range !== 'undefined') {
  const RP = (globalThis as any).Range.prototype as any;
  if (typeof RP.getClientRects !== 'function') {
    RP.getClientRects = () => [{ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }];
  }
  if (typeof RP.getBoundingClientRect !== 'function') {
    RP.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 });
  }
}
