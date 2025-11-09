// DOM 工具模块：安全选择器、文本节点遍历等

/**
 * 创建文本节点的 TreeWalker
 * 默认遍历 document.body；可传入自定义根节点
 */
export function createTextNodeWalker(root: Node = document.body): TreeWalker | null {
  if (!root) return null;
  try {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // 排除不可见或不相关元素
        if (parent.closest('script, style, noscript, svg, canvas')) {
          return NodeFilter.FILTER_REJECT;
        }
        const content = (node as Text).textContent ?? '';
        if (!content.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        try {
          const style = getComputedStyle(parent);
          if (style && (style.visibility === 'hidden' || style.display === 'none')) {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // 某些节点可能无法获取样式，忽略错误
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
  } catch {
    return null;
  }
}

/**
 * 安全的 CSS 选择器转义
 */
export function safeCssEscape(value: string): string {
  try {
    if (typeof CSS !== 'undefined' && typeof (CSS as any).escape === 'function') {
      return (CSS as any).escape(value);
    }
  } catch {}
  return String(value).replace(/["\\]/g, '\\$&');
}

// 为兼容旧调用，提供同名导出
export function cssEscape(value: string): string {
  return safeCssEscape(value);
}

/**
 * 带错误保护的 querySelector，避免选择器异常导致崩溃
 */
export function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}