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
  const query = text.trim();
  if (!query) return null;

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
      } catch {
        // 某些节点可能无法获取样式，忽略错误
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  const buffer: string[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    const t = current as Text;
    textNodes.push(t);
    buffer.push(t.textContent ?? '');
    current = walker.nextNode();
  }

  if (!textNodes.length) return null;

  const combined = buffer.join('');
  const normalizedCombined = normalizeWhitespace(combined);
  const normalizedQuery = normalizeWhitespace(query);

  let index = -1;
  let searchStartPos = 0;
  while (true) {
    let foundIndex = combined.toLowerCase().indexOf(query.toLowerCase(), searchStartPos);
    if (foundIndex === -1) {
      const normalizedFoundIndex = normalizedCombined.toLowerCase().indexOf(
        normalizedQuery.toLowerCase(),
        searchStartPos
      );
      if (normalizedFoundIndex === -1) break;
      foundIndex = mapNormalizedIndexToOriginal(combined, normalizedCombined, normalizedFoundIndex);
    }

    if (skipHighlighted && isRangeHighlighted(textNodes, foundIndex, query.length)) {
      searchStartPos = foundIndex + 1;
      continue;
    }
    index = foundIndex;
    break;
  }

  if (index === -1) return null;

  let remaining = index;
  let startNode: Text | null = null;
  let startOffset = 0;
  for (const tn of textNodes) {
    const len = tn.textContent?.length ?? 0;
    if (remaining < len) {
      startNode = tn;
      startOffset = remaining;
      break;
    }
    remaining -= len;
  }
  if (!startNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);

  let remainingLength = query.length;
  let endNode: Text = startNode;
  let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
  remainingLength -= endOffset - startOffset;

  let idx = textNodes.indexOf(startNode);
  while (remainingLength > 0 && idx + 1 < textNodes.length) {
    idx += 1;
    const nextNode = textNodes[idx];
    const len = nextNode.textContent?.length ?? 0;
    if (len === 0) continue;
    if (remainingLength <= len) {
      endNode = nextNode;
      endOffset = remainingLength;
      remainingLength = 0;
      break;
    }
    remainingLength -= len;
    endNode = nextNode;
    endOffset = len;
  }

  range.setEnd(endNode, endOffset);
  return range;
}