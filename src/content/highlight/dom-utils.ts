// DOM 工具模块：安全选择器、文本节点遍历等

// 创建文本节点 TreeWalker（默认 document.body，可传入自定义根节点）
export function createTextNodeWalker(root: Node = document.body): TreeWalker | null {
  if (!root) return null;
  try {
    // 调用方同步遍历；下一次定位使用新 walker，重新检查页面样式。
    const visibleParents = new WeakMap<Element, boolean>();
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const content = (node as Text).textContent ?? '';
        if (!content.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        let visible = visibleParents.get(parent);
        if (visible === undefined) {
          if (parent.closest('script, style, noscript, svg, canvas')) {
            visible = false;
          } else {
            try {
              const style = getComputedStyle(parent);
              visible = !style || (style.visibility !== 'hidden' && style.display !== 'none');
            } catch {
              // 样式读取失败不缓存，后续节点仍可重试。
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          visibleParents.set(parent, visible);
        }
        return visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
  } catch {
    return null;
  }
}

// CSS 选择器安全转义
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

// 带错误保护的 querySelector（避免选择器异常导致崩溃）
export function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}
