// 文本搜索与范围定位的纯函数模块
// 目标：在富文本结构中查找指定文本的 Range，支持跨节点与忽略空白差异

// 规范化空白：连续空白合并为单个空格
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// 将规范化文本索引映射回原始文本索引
export function mapNormalizedIndexToOriginal(
  original: string,
  _normalized: string,
  normalizedIndex: number
): number {
  let originalIndex = 0;
  let normalizedCount = 0;
  let inWhitespace = false;

  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i];
    const isWs = /\s/.test(ch);

    if (isWs) {
      if (!inWhitespace) {
        inWhitespace = true;
        if (normalizedCount === normalizedIndex) {
          return originalIndex;
        }
        normalizedCount += 1; // 规范化为单个空格
      }
    } else {
      inWhitespace = false;
      if (normalizedCount === normalizedIndex) {
        return originalIndex;
      }
      normalizedCount += 1;
    }

    originalIndex += 1;
  }

  return originalIndex;
}

// 判断指定范围是否已高亮（父级存在 data-clipsey-id）
export function isRangeHighlighted(textNodes: Text[], startIndex: number, length: number): boolean {
  let remaining = startIndex;
  let checkLength = length;

  for (const tn of textNodes) {
    const nodeLen = tn.textContent?.length ?? 0;
    if (remaining < nodeLen) {
      let currentNode: Text | null = tn;
      let nodeIndex = textNodes.indexOf(tn);

      while (checkLength > 0 && currentNode) {
        const parent = currentNode.parentElement;
        if (parent?.closest('[data-clipsey-id]')) {
          return true;
        }

        const currentNodeLen = currentNode.textContent?.length ?? 0;
        const checkedInThisNode = Math.min(checkLength, currentNodeLen - remaining);
        checkLength -= checkedInThisNode;
        remaining = 0;
        nodeIndex += 1;
        currentNode = nodeIndex < textNodes.length ? textNodes[nodeIndex] : null;
      }

      return false;
    }
    remaining -= nodeLen;
  }

  return false;
}

// 在根节点下查找文本 Range（跨节点、忽略空白；仅定位不修改），可跳过已高亮内容。
export function findTextRangeInNode(root: Node, text: string, skipHighlighted = true): Range | null {
  if (!root) return null;
  const rawQuery = text.trim();
  if (!rawQuery) return null;

  const normalizedQuery = normalizeWhitespace(rawQuery).toLowerCase();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
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
      } catch {}
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let qIndex = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let prevWasWs = false;

  let current: Node | null = walker.nextNode();
  while (current) {
    const tn = current as Text;
    const textContent = tn.textContent ?? '';
    const parent = tn.parentElement;
    // 高亮跳过：若要求跳过且父级已高亮，直接进入下一个节点
    if (skipHighlighted && parent?.closest('[data-clipsey-id]')) {
      current = walker.nextNode();
      continue;
    }

    for (let i = 0; i < textContent.length; i += 1) {
      const ch = textContent[i];
      const isWs = /\s/.test(ch);
      let tChar: string;
      if (isWs) {
        if (prevWasWs) {
          // 连续空白折叠，跳过本字符
          continue;
        }
        tChar = ' ';
        prevWasWs = true;
      } else {
        tChar = ch.toLowerCase();
        prevWasWs = false;
      }

      const qChar = normalizedQuery[qIndex];
      if (qChar === tChar) {
        if (qIndex === 0) {
          startNode = tn;
          startOffset = i;
        }
        qIndex += 1;
        if (qIndex === normalizedQuery.length) {
          endNode = tn;
          endOffset = i + 1;
          // 构建并返回 Range
          if (startNode && endNode) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range;
          }
          // 匹配完成但无法构造范围，重置
          qIndex = 0;
          startNode = null;
        }
      } else {
        // 失配：若当前字符可作为新匹配起点，则尝试退回到 0 或 1
        qIndex = 0;
        startNode = null;
      }
    }
    current = walker.nextNode();
  }

  return null;
}