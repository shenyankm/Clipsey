import { createTextNodeWalker } from '../dom-utils';

/** 依据文档偏移量定位目标 Range。 */
export function locateByOffset(offset: number, length: number): Range | null {
  try {
    const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const normalizedLength = Number.isFinite(length) ? Math.max(1, Math.floor(length)) : 1;
    let remaining = normalizedOffset;
    const walker = createTextNodeWalker();
    if (!walker) return null;

    let current: Node | null = walker.nextNode();
    while (current) {
      if (current instanceof Text) {
        const text = current.textContent ?? '';
        const size = text.length;
        if (size > 0) {
          if (remaining < size) {
            const start = Math.max(0, Math.min(size, remaining));
            const range = document.createRange();
            range.setStart(current, start);

            let remainingLength = normalizedLength;
            let availableInNode = size - start;
            let endNode: Text = current;
            let endOffset = start;

            if (remainingLength <= availableInNode) {
              endOffset = start + remainingLength;
              range.setEnd(endNode, endOffset);
              return range;
            }

            remainingLength -= availableInNode;
            endOffset = size;

            while (remainingLength > 0) {
              const nextNode = walker.nextNode();
              if (!nextNode || !(nextNode instanceof Text)) {
                break;
              }

              const nextText = nextNode.textContent ?? '';
              const nextSize = nextText.length;
              if (nextSize === 0) {
                continue;
              }

              endNode = nextNode;
              if (remainingLength <= nextSize) {
                endOffset = remainingLength;
                remainingLength = 0;
              } else {
                remainingLength -= nextSize;
                endOffset = nextSize;
              }
            }

            range.setEnd(endNode, endOffset);
            return range;
          }
          remaining -= size;
        }
      }
      current = walker.nextNode();
    }
    return null;
  } catch {
    return null;
  }
}
