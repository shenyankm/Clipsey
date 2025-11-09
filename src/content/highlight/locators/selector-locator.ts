import { findTextRangeInNode } from '../text-search';

/**
 * 基于 CSS 选择器定位文本范围
 * 通过锚点元素缩小搜索范围
 */
export function locateBySelector(anchorSelector: string, text: string): Range | null {
  try {
    const anchor = document.querySelector(anchorSelector);
    if (!anchor) return null;
    return findTextRangeInNode(anchor, text);
  } catch {
    return null;
  }
}
