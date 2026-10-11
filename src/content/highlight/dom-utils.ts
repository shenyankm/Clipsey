// DOM 工具模块：安全选择器、文本节点遍历等

// 创建文本遍历器（默认 document.body，可传入自定义根节点）
export function createTextNodeWalker(root: Node = document.body, includeWhitespace = false): Pick<TreeWalker, 'nextNode' | 'filter'> | null {
  if (!root) return null;
  try {
    const visibleParents = new WeakMap<Element, boolean>();
    const barriers = new WeakMap<Element, Element | null>();
    let lastBarrier: Element | null = null;
    function hiddenAncestor(element: Element | null): Element | null {
      if (!element) return null;
      const cached = barriers.get(element);
      if (cached !== undefined) return cached;
      const pending: Element[] = [];
      let barrier: Element | null = null;
      while (element) {
        const cached = barriers.get(element);
        if (cached !== undefined) { barrier = cached; break; }
        pending.push(element);
        if (getComputedStyle(element)?.display === 'none') { barrier = element; break; }
        element = element.parentElement;
      }
      for (const ancestor of pending) barriers.set(ancestor, barrier);
      return barrier;
    }
    const filter = {
      acceptNode(node: Node) {
        lastBarrier = null;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (!includeWhitespace && !(node.textContent ?? '').trim()) return NodeFilter.FILTER_SKIP;
        let visible = visibleParents.get(parent);
        if (visible === undefined) {
          const excluded = parent.closest('script, style, noscript, svg, canvas');
          if (excluded) {
            visible = false;
            barriers.set(parent, excluded);
          } else {
            try {
              let barrier = hiddenAncestor(parent.parentElement);
              if (!barrier) {
                const style = getComputedStyle(parent);
                if (style?.display === 'none') barrier = parent;
                visible = !barrier && style?.visibility !== 'hidden';
              } else visible = false;
              barriers.set(parent, barrier);
            } catch {
              // 读取失败不缓存，下一节点仍可重试。
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          visibleParents.set(parent, visible);
        }
        lastBarrier = barriers.get(parent) ?? null;
        return visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let finished = false;
    return { filter,
      nextNode() {
        if (finished) return null;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT) return node;
          if (lastBarrier) {
            if (lastBarrier === root || !root.contains(lastBarrier)) { finished = true; return null; }
            // currentNode 可指向非文本节点；从最后一个后代继续可跳过整个隐藏子树。
            let last: Node = lastBarrier;
            while (last.lastChild) last = last.lastChild;
            walker.currentNode = last;
          }
        }
        return null;
      }
    };
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
