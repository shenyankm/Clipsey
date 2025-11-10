import { detectTopObstructionHeight, scheduleFallbackScrolls } from './viewport';

/** 滚动管理器：将高亮范围滚动至可视区域并考虑顶部遮挡。 */
export class ScrollManager {
  /** 滚动至视口：考虑顶部固定元素遮挡。 */
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
