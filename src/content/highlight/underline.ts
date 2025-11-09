// 下划线临时高亮模块：用于焦点定位时的短暂可视提示
import { getInlineHighlightColor } from '@/content/color-manager';

const MAX_UNDERLINES = 100;
const UNDERLINE_ID = 'page-clipper-underline-layer';

let underlineContainer: HTMLDivElement | null = null;
const activeUnderlines: HTMLDivElement[] = [];

export function underlineRange(range: Range): void {
  underlineRanges([range.cloneRange()]);
}

export function ensureUnderlineContainer(): HTMLDivElement | null {
  if (!document.body) {
    return null;
  }
  if (underlineContainer && document.body.contains(underlineContainer)) {
    return underlineContainer;
  }
  underlineContainer = document.createElement('div');
  underlineContainer.id = UNDERLINE_ID;
  underlineContainer.style.position = 'absolute';
  underlineContainer.style.left = '0';
  underlineContainer.style.top = '0';
  underlineContainer.style.width = '0';
  underlineContainer.style.height = '0';
  underlineContainer.style.pointerEvents = 'none';
  underlineContainer.style.zIndex = '2147483647';
  underlineContainer.style.margin = '0';
  underlineContainer.style.padding = '0';
  underlineContainer.style.border = '0';
  document.body.appendChild(underlineContainer);
  return underlineContainer;
}

export function underlineRanges(ranges: Range[]): void {
  if (!ranges.length || !document.body) {
    return;
  }
  const container = ensureUnderlineContainer();
  if (!container) return;
  if (activeUnderlines.length >= MAX_UNDERLINES) {
    clearOldestUnderlines(Math.floor(MAX_UNDERLINES / 2));
  }
  const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
  const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
  for (const range of ranges) {
    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      const underline = document.createElement('div');
      underline.className = 'clipsey-highlight';
      underline.style.position = 'absolute';
      underline.style.pointerEvents = 'none';
      underline.style.left = `${rect.left + scrollX}px`;
      underline.style.top = `${rect.top + scrollY}px`;
      underline.style.width = `${rect.width}px`;
      underline.style.height = `${rect.height}px`;
      underline.style.backgroundColor = getInlineHighlightColor();
      underline.style.boxSizing = 'border-box';
      underline.style.borderRadius = '3px';
      container.appendChild(underline);
      activeUnderlines.push(underline);
    }
  }
}

export function clearUnderlines(): void {
  while (activeUnderlines.length) {
    const underline = activeUnderlines.pop();
    underline?.remove();
  }
}

export function clearOldestUnderlines(count: number): void {
  const toRemove = activeUnderlines.splice(0, count);
  for (const underline of toRemove) underline?.remove();
}