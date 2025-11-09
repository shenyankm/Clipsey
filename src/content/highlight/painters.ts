// 高亮绘制器：负责内联高亮与覆盖层高亮的 DOM 操作
import { HIGHLIGHT_INLINE_CLASS as INLINE_CLASS, HIGHLIGHT_OVERLAY_CLASS as OVERLAY_CLASS } from '@/content/color-manager';

function createInlineSpan(id?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = INLINE_CLASS;
  if (id) {
    span.dataset.clipseyId = id;
    span.dataset.clipsey = 'true';
  }
  span.style.borderRadius = '3px';
  span.style.padding = '0';
  return span;
}

type HighlightSegment = { node: Text; start: number; end: number };

function collectSegments(range: Range): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    if (!range.intersectsNode(textNode)) {
      current = walker.nextNode();
      continue;
    }
    if (textNode.parentElement?.closest('[data-clipsey-id]')) {
      current = walker.nextNode();
      continue;
    }
    const parent = textNode.parentElement;
    if (parent) {
      try {
        const style = getComputedStyle(parent);
        if (style.visibility === 'hidden' || style.display === 'none') {
          current = walker.nextNode();
          continue;
        }
      } catch {}
    }
    const content = textNode.textContent ?? '';
    if (!content.trim()) {
      current = walker.nextNode();
      continue;
    }
    const length = content.length;
    let start = 0;
    let end = length;
    if (textNode === range.startContainer) {
      start = Math.max(0, Math.min(length, range.startOffset));
    }
    if (textNode === range.endContainer) {
      end = Math.max(0, Math.min(length, range.endOffset));
    }
    if (start >= end) {
      current = walker.nextNode();
      continue;
    }
    segments.push({ node: textNode, start, end });
    current = walker.nextNode();
  }
  return segments;
}

function wrapSegment(range: Range, id?: string): HTMLSpanElement | null {
  const span = createInlineSpan(id);
  try {
    range.surroundContents(span);
    return span;
  } catch {
    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      return span;
    } catch {
      span.remove();
      return null;
    }
  }
}

export function applyInline(range: Range, id?: string): HTMLElement[] {
  const text = range.toString();
  if (!text) return [];
  const segments = collectSegments(range);
  const created: HTMLElement[] = [];
  for (const { node, start, end } of segments) {
    if (!node.isConnected) continue;
    const seg = document.createRange();
    seg.setStart(node, start);
    seg.setEnd(node, end);
    const span = wrapSegment(seg, id);
    if (span) created.push(span);
  }
  if (!created.length) {
    const span = wrapSegment(range, id);
    if (span) created.push(span);
  }
  return created;
}

export function applyOverlay(range: Range): HTMLElement[] {
  let rects = Array.from(typeof range.getClientRects === 'function' ? range.getClientRects() : []);
  if (!rects.length) {
    const fallback = range.getBoundingClientRect?.();
    if (fallback && (fallback.width > 0 || fallback.height > 0)) {
      rects = [fallback];
    }
  }
  if (!rects.length) return [];
  const overlays: HTMLElement[] = [];
  for (const rect of rects) {
    const div = document.createElement('div');
    div.className = OVERLAY_CLASS;
    div.style.position = 'absolute';
    div.style.left = `${rect.left + window.scrollX}px`;
    div.style.top = `${rect.top + window.scrollY}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${Math.max(1, rect.height)}px`;
    div.style.pointerEvents = 'none';
    div.style.zIndex = '2147483647';
    document.body.appendChild(div);
    overlays.push(div);
  }
  return overlays;
}