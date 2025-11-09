import { detectTopObstructionHeight, scheduleFallbackScrolls } from './viewport';

/**
 * 滚动管理器
 * 负责将高亮范围滚动到可视区域
 */
export class ScrollManager {
  /**
   * 将指定的 Range 滚动到视口中
   * 考虑页面顶部的固定元素（如导航栏）
   */
  static scrollIntoView(range: Range): void {
    try {
      const rect = range.getBoundingClientRect();
      if (!rect) return;
      
      const obstruction = detectTopObstructionHeight();
      const baseline = obstruction.detected ? obstruction.offset : 16;
      const targetY = Math.max(0, rect.top + window.scrollY - baseline);
      
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      
      // 额外的兜底滚动，避免固定头部晚于滚动生效导致覆盖
      scheduleFallbackScrolls(targetY);
    } catch {
      // noop
    }
  }
}
