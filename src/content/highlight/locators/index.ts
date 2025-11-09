import { locateByOffset } from './offset-locator';
import { locateBySelector } from './selector-locator';
import { locateByContext } from './context-locator';
import { findTextRangeInNode } from '../text-search';

/**
 * 定位策略配置
 */
export interface LocateOptions {
  text: string;
  textOffset?: number;
  anchorSelector?: string;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * 多级定位策略管理器
 * 按优先级尝试不同的定位方法，使用第一个成功的结果
 * 
 * 优先级顺序：
 * 1. textOffset（最精确）
 * 2. anchorSelector（缩小搜索范围）
 * 3. context（上下文匹配）
 * 4. fulltext（全文搜索，后备方案）
 */
export class LocationStrategy {
  /**
   * 执行定位策略链
   */
  static locate(options: LocateOptions): Range | null {
    const { text, textOffset, anchorSelector, contextBefore, contextAfter } = options;
    
    // 策略 1: 优先使用 textOffset（最精确）
    if (textOffset != null && typeof textOffset === 'number') {
      const range = locateByOffset(textOffset, text.length);
      if (range) return range;
    }
    
    // 策略 2: 尝试使用 anchorSelector 缩小搜索范围
    if (anchorSelector) {
      const range = locateBySelector(anchorSelector, text);
      if (range) return range;
    }
    
    // 策略 3: 尝试使用上下文匹配
    if (contextBefore || contextAfter) {
      const range = locateByContext(text, contextBefore, contextAfter);
      if (range) return range;
    }
    
    // 策略 4: 在整个文档中搜索（后备方案）
    return findTextRangeInNode(document.body, text);
  }
}
