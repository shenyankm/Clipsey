// DOM 工具模块：安全选择器、文本节点遍历等

// 创建文本节点 TreeWalker（默认 document.body，可传入自定义根节点）
export function createTextNodeWalker(root: Node = document.body, includeWhitespace = false): TreeWalker | null {
  if (!root) return null;
  try {
    // 调用方同步遍历；下一次定位使用新 walker，重新检查页面样式。
    const visibleParents = new WeakMap<Element, boolean>();
    const displayedAncestors = new WeakMap<Element, boolean>();
    function ancestorsDisplayed(element: Element | null): boolean {
      if (!element) return true;
      const cached = displayedAncestors.get(element);
      if (cached !== undefined) return cached;
      const pending: Element[] = [];
      let displayed = true;
      while (element) {
        const cached = displayedAncestors.get(element);
        if (cached !== undefined) { displayed = cached; break; }
        pending.push(element);
        if (getComputedStyle(element)?.display === 'none') { displayed = false; break; }
        element = element.parentElement;
      }
      for (const ancestor of pending) displayedAncestors.set(ancestor, displayed);
      return displayed;
    }
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const content = (node as Text).textContent ?? '';
        if (!includeWhitespace && !content.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        let visible = visibleParents.get(parent);
        if (visible === undefined) {
          if (parent.closest('script, style, noscript, svg, canvas')) {
            visible = false;
          } else {
            try {
              visible = ancestorsDisplayed(parent.parentElement);
              if (!visible) displayedAncestors.set(parent, false);
              if (visible) {
                const style = getComputedStyle(parent);
                const displayed = style?.display !== 'none';
                displayedAncestors.set(parent, displayed);
                // visibility 可由子元素覆盖，display:none 祖先则隐藏整个子树。
                visible = displayed && style?.visibility !== 'hidden';
              }
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
