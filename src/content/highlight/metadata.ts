// 选区元数据与选择器构建模块
import { createTextNodeWalker } from '@/content/highlight/dom-utils';

export type HighlightMetadata = {
  highlightId: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
};

const CONTEXT_RADIUS = 64;

export function captureHighlightMetadata(
  range: Range | null,
  span: HTMLSpanElement | null,
  highlightId: string
): HighlightMetadata | null {
  if (!range) return null;

  const selectionText = range.toString();
  const leadingWhitespace = selectionText.length - selectionText.trimStart().length;
  const selectionLength = selectionText.trim().length;
  let contextBefore: string | undefined;
  let contextAfter: string | undefined;
  let textOffset: number | undefined;

  const walker = range.startContainer.nodeType === Node.TEXT_NODE && document.body?.contains(range.startContainer)
    ? createTextNodeWalker() : null;
  if (walker) {
    const beforeParts: string[] = [];
    let beforeLength = 0;
    let after = '';
    let aggregateOffset = 0;
    let node = walker.nextNode();
    while (node) {
      const content = node.textContent ?? '';
      if (node === range.startContainer) {
        textOffset = aggregateOffset + Math.min(range.startOffset, content.length) + leadingWhitespace;
      }
      const beforeEnd = textOffset === undefined ? content.length : Math.max(0, Math.min(content.length, textOffset - aggregateOffset));
      if (beforeEnd > 0) {
        const part = content.slice(Math.max(0, beforeEnd - CONTEXT_RADIUS), beforeEnd);
        beforeParts.push(part);
        beforeLength += part.length;
        while (beforeParts.length > 1 && beforeLength - beforeParts[0]!.length >= CONTEXT_RADIUS) {
          beforeLength -= beforeParts.shift()!.length;
        }
      }
      if (textOffset !== undefined) {
        const afterStart = Math.max(0, textOffset + selectionLength - aggregateOffset);
        after += content.slice(afterStart, afterStart + CONTEXT_RADIUS - after.length);
      }
      aggregateOffset += content.length;
      if (textOffset !== undefined && after.length === CONTEXT_RADIUS) break;
      node = walker.nextNode();
    }
    if (textOffset !== undefined) {
      const beforeStart = Math.max(0, textOffset - CONTEXT_RADIUS);
      const collectedStart = Math.max(0, Math.min(textOffset, aggregateOffset) - CONTEXT_RADIUS);
      contextBefore = beforeParts.join('').slice(-CONTEXT_RADIUS).slice(beforeStart - collectedStart);
      contextAfter = after;
    }
  }

  const anchorSelector = buildCssPath(span?.parentElement ?? span ?? undefined);

  return { highlightId, contextBefore, contextAfter, anchorSelector, textOffset };
}

export function buildCssPath(element: Element | undefined): string | undefined {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return undefined;

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const el = current as Element;
    const tagName = el.tagName.toLowerCase();

    if (!el.parentElement || el === document.body) {
      segments.unshift(tagName);
      break;
    }

    if (el.id) {
      segments.unshift(tagName + '#' + el.id);
      break;
    }

    const parent = el.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children) as Element[];
    let count = 0;
    let index = 0;
    for (const sibling of siblings) {
      if (sibling.tagName === el.tagName) {
        count += 1;
        if (sibling === el) index = count;
      }
    }

    if (count > 1) {
      segments.unshift(tagName + ':nth-of-type(' + index + ')');
    } else {
      segments.unshift(tagName);
    }

    current = parent;
  }

  return segments.join(' > ');
}
