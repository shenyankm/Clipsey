import { createTextNodeWalker } from './dom-utils';

// 规范化空白：连续空白合并为单个空格。
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// 把规范化后的字符位置映射回原文，包含大小写转换增加字符的情况。
function mapNormalizedRangeToOriginal(original: string, normalizedStart: number, normalizedEnd: number): [number, number] {
  let count = 0;
  let inWhitespace = false;
  let start: number | undefined;
  const whitespacePattern = /\s/;
  for (let i = 0; i < original.length; i += 1) {
    const code = original.charCodeAt(i);
    const latin1 = code <= 0xff;
    const char = latin1 ? '' : original.charAt(i);
    // Latin-1 小写仍占一个 UTF-16 单元，无需逐字符创建字符串。
    const whitespace = latin1 ? code === 32 || code === 160 || (code >= 9 && code <= 13) : whitespacePattern.test(char);
    const length = whitespace ? (inWhitespace ? 0 : 1) : latin1 ? 1 : char.toLowerCase().length;
    if (start === undefined && count + length > normalizedStart) start = i;
    if (count + length > normalizedEnd) return [start ?? i, i + 1];
    count += length;
    inWhitespace = whitespace;
  }
  return [start ?? original.length, original.length];
}

function isRangeHighlighted(nodes: Text[], start: number, end: number): boolean {
  let offset = 0;
  for (const node of nodes) {
    const next = offset + node.length;
    if (next > start && offset < end && node.parentElement?.closest('[data-clipsey-id]')) {
      return true;
    }
    offset = next;
  }
  return false;
}

// 使用原生 indexOf 处理重复前缀，再将匹配边界映射到文本节点。
export function findTextRangeInNode(root: Node, text: string, skipHighlighted = true): Range | null {
  if (!root) return null;
  const query = normalizeWhitespace(text).toLowerCase();
  if (!query) return null;

  const walker = createTextNodeWalker(root, true);
  if (!walker) return null;
  const nodes: Text[] = [];
  const filter = walker.filter as { acceptNode(node: Node): number };
  if (root instanceof Text && filter.acceptNode(root) === NodeFilter.FILTER_ACCEPT) nodes.push(root);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }

  const original = nodes.map(node => node.data).join('');
  const normalized = original.replace(/\s+/g, ' ').toLowerCase();
  let index = normalized.indexOf(query);
  while (index !== -1) {
    const [start, end] = mapNormalizedRangeToOriginal(original, index, index + query.length - 1);
    if (!skipHighlighted || !isRangeHighlighted(nodes, start, end)) {
      const range = document.createRange();
      let offset = 0;
      for (const node of nodes) {
        const next = offset + node.length;
        if (start >= offset && start < next) range.setStart(node, start - offset);
        if (end > offset && end <= next) {
          range.setEnd(node, end - offset);
          return range;
        }
        offset = next;
      }
    }
    index = normalized.indexOf(query, index + 1);
  }
  return null;
}
