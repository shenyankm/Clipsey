import { createTextNodeWalker } from '../dom-utils';

/** 一次遍历定位多个偏移；只保留待定位的边界，不缓存整页文本节点。 */
export function locateByOffsets(targets: { offset: number; length: number }[]): (Range | null)[] {
  const ranges: (Range | null)[] = targets.map(() => null);
  if (!targets.length) return ranges;
  try {
    const points = targets.flatMap(({ offset, length }, index) => {
      const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      const size = Number.isFinite(length) ? Math.max(1, Math.floor(length)) : 1;
      return [{ offset: start, index, end: false }, { offset: start + size, index, end: true }];
    }).sort((a, b) => a.offset - b.offset || Number(b.end) - Number(a.end));
    const walker = createTextNodeWalker();
    if (!walker) return ranges;
    let position = 0;
    let next = 0;
    let node = walker.nextNode();
    let last: Text | null = null;
    while (node && next < points.length) {
      const text = node as Text;
      const end = position + text.length;
      while (next < points.length) {
        const point = points[next]!;
        // 结束边界留在前一节点末尾；起始边界移到下一节点开头。
        if (point.offset > end || (point.offset === end && !point.end)) break;
        if (point.end) {
          ranges[point.index]?.setEnd(text, point.offset - position);
        } else {
          const range = document.createRange();
          range.setStart(text, point.offset - position);
          ranges[point.index] = range;
        }
        next++;
      }
      last = text;
      position = end;
      if (next < points.length) node = walker.nextNode();
    }
    // 保留单条定位越过文档末尾时截到最后文本节点的原有行为。
    if (last) {
      for (; next < points.length; next++) {
        const point = points[next]!;
        if (point.end) ranges[point.index]?.setEnd(last, last.length);
      }
    }
    return ranges;
  } catch {
    return targets.map(() => null);
  }
}

/** 依据文档偏移量定位目标 Range。 */
export function locateByOffset(offset: number, length: number): Range | null {
  return locateByOffsets([{ offset, length }])[0] ?? null;
}
