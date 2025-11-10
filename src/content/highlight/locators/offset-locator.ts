import { createTextNodeWalker } from '../dom-utils';

/** 基于文档偏移量定位文本范围（精确定位）。 */
export function locateByOffset(offset: number, length: number): Range | null {
  try {
    let remaining = offset;
    const walker = createTextNodeWalker();
    if (!walker) return null;
    
    let current: Node | null = walker.nextNode();
    while (current) {
      if (current instanceof Text) {
        const text = current.textContent ?? '';
        const size = text.length;
        if (remaining <= size) {
          const start = remaining;
          const end = Math.min(size, start + length);
          const range = document.createRange();
          range.setStart(current, start);
          range.setEnd(current, end);
          return range;
        }
        remaining -= size;
      }
      current = walker.nextNode();
    }
    return null;
  } catch {
    return null;
  }
}
