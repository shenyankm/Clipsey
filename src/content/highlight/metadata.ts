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

  const documentData = computeDocumentTextData(range);
  const selectionText = range.toString();
  let contextBefore: string | undefined;
  let contextAfter: string | undefined;
  let textOffset: number | undefined;

  if (documentData) {
    textOffset = documentData.offset;
    const beforeStart = Math.max(0, documentData.offset - CONTEXT_RADIUS);
    const afterStart = documentData.offset + selectionText.length;
    contextBefore = documentData.text.slice(beforeStart, documentData.offset);
    contextAfter = documentData.text.slice(afterStart, afterStart + CONTEXT_RADIUS);
  }

  const anchorSelector = buildCssPath(span?.parentElement ?? span ?? undefined);

  return { highlightId, contextBefore, contextAfter, anchorSelector, textOffset };
}

export function computeDocumentTextData(range: Range | null): { offset: number; text: string } | null {
  if (!range || !document.body) return null;
  const walker = createTextNodeWalker();
  if (!walker) return null;

  let node = walker.nextNode();
  const textParts: string[] = [];
  let aggregateOffset = 0;
  let startOffset: number | null = null;

  while (node) {
    const textNode = node as Text;
    const content = textNode.textContent ?? '';
    if (textNode === range.startContainer) {
      startOffset = aggregateOffset + Math.min(range.startOffset, content.length);
    }
    textParts.push(content);
    aggregateOffset += content.length;
    node = walker.nextNode();
  }

  if (startOffset == null) return null;
  return { offset: startOffset, text: textParts.join('') };
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
    for (let i = 0; i < siblings.length; i += 1) {
      const sibling = siblings[i];
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