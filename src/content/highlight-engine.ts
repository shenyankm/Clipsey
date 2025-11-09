type RemoteHighlight = {
  id?: string;
  highlightId?: string;
  textContent?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
};
import { ensureHighlightColorsReady } from '@/content/color-manager';
import { applyInline, applyOverlay } from '@/content/highlight/painters';
import { createTextNodeWalker, safeCssEscape } from '@/content/highlight/dom-utils';
import { findTextRangeInNode } from '@/content/highlight/text-search';
import { detectTopObstructionHeight, scheduleFallbackScrolls } from '@/content/highlight/viewport';

// 抽取到通用模块：createTextNodeWalker

// 抽取到通用模块：safeCssEscape

/**
 * 在指定根节点下查找文本范围，支持跨多个文本节点与嵌套富文本结构。
 * 为避免破坏原有富文本结构，仅定位 Range，不做变更。
 * 
 * 优化要点:
 * 1. 支持富文本结构中的文本查找
 * 2. 跨元素精确定位（如 <strong>、<em> 等标签）
 * 3. 忽略空白字符差异,提升匹配成功率
 * 4. 支持跳过已高亮内容，查找下一个匹配位置
 * 
 * @param root 搜索的根节点
 * @param text 要查找的文本
 * @param skipHighlighted 是否跳过已高亮的内容（默认true）
 * @returns 找到的第一个未高亮的匹配范围，如果没有找到则返回null
 */
// 抽取到纯函数模块：findTextRangeInNode

/**
 * 检查指定位置的文本范围是否已被高亮
 * @param textNodes 文本节点数组
 * @param startIndex 在合并文本中的起始索引
 * @param length 文本长度
 * @returns 如果该范围已被高亮则返回true
 */
// 抽取到纯函数模块：isRangeHighlighted

/**
 * 规范化空白字符,将连续空白替换为单个空格
 */
// 抽取到纯函数模块：normalizeWhitespace

/**
 * 将规范化文本中的索引映射回原始文本索引
 */
// 抽取到纯函数模块：mapNormalizedIndexToOriginal

/**
 * 应用内联高亮：在选中文本外包裹高亮元素
 * 颜色通过 CSS 变量统一管理，不在此处硬编码
 */
/**
 * 创建高亮元素，保留富文本结构与可访问性标识
 */
// 抽取到 painters 模块

// 抽取到 painters 模块

// 抽取到 painters 模块

// 抽取到 painters 模块

/**
 * 应用覆盖层高亮：创建浮动遮罩层覆盖在选中文本上
 * 颜色通过 CSS 变量统一管理，不在此处硬编码
 */
// 抽取到 painters 模块

function scrollRangeIntoView(range: Range): void {
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

/**
 * HighlightEngine - 高亮引擎
 * 
 * 功能说明:
 * 1. 支持富文本内容的高亮处理
 * 2. 跨元素高亮(如 <strong>、<em>、<a> 等)
 * 3. 多级定位策略:
 *    - textOffset: 文档偏移量定位(最精确)
 *    - anchorSelector: CSS选择器缩小搜索范围
 *    - context: 上下文匹配
 *    - fulltext: 全文搜索(后备)
 * 4. 高亮持久化:页面刷新后自动恢复
 * 5. 内存管理:防止高亮数量过多导致内存泄漏
 * 
 * 优化要点:
 * - 忽略空白字符差异,提升匹配成功率
 * - 支持嵌套标签结构的完整保留
 * - 避免重复高亮同一内容
 */
export class HighlightEngine {
  private activeSpans: Map<string, HTMLElement[]> = new Map();
  private readonly maxHighlights = 200; // 防止内存泄漏：限制最大高亮数量
  private throttled = 16; // ms
  private abortController: AbortController | null = null;
  private lastPerf: { durationMs: number; appliedCount: number } | null = null;

  setThrottle(ms: number): void {
    this.throttled = Math.max(0, ms | 0);
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  clear(): void {
    for (const spans of this.activeSpans.values()) {
      for (const span of spans) {
        try {
          const parent = span.parentNode;
          if (!parent) continue;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        } catch {
          // ignore
        }
      }
    }
    this.activeSpans.clear();
  }

  undo(highlightId: string): boolean {
    const spans = this.activeSpans.get(highlightId);
    if (!spans) return false;
    for (const span of spans) {
      try {
        const parent = span.parentNode;
        if (!parent) continue;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      } catch {
        // ignore
      }
    }
    this.activeSpans.delete(highlightId);
    return true;
  }

  async focusClip(payload: { textContent?: string; id?: string } | undefined): Promise<boolean> {
    const text = payload?.textContent?.trim();
    if (!text) return false;
    const range = findTextRangeInNode(document.body, text);
    if (!range) return false;
    scrollRangeIntoView(range);
    return true;
  }

  async activateHighlights(highlights: RemoteHighlight[]): Promise<boolean> {
    if (!Array.isArray(highlights) || highlights.length === 0) return false;
    
    // 等待 DOM 就绪(如果页面还在加载中)
    await this.waitForDOMReady();
    
    // 防止内存泄漏:如果超过最大数量,清理旧的
    if (this.activeSpans.size >= this.maxHighlights) {
      this.clearOldestHighlights(Math.floor(this.maxHighlights / 2));
    }
    
    // 确保高亮颜色已准备好（动态从设置读取并注入CSS变量）
    await ensureHighlightColorsReady().catch(() => {});
    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    const tasks = highlights.map(async (h) => {
      if (signal.aborted) return false;
      const text = h.textContent?.trim();
      if (!text) return false;
      
      const id = h.highlightId ?? h.id ?? text;
      
      // 增强的重复高亮检查：同时检查 activeSpans 和 DOM
      if (id) {
        // 检查内存中是否已有
        if (this.activeSpans.has(id)) {
          // 检查 DOM 中是否真的存在
          const existingSpans = this.activeSpans.get(id);
          if (existingSpans && existingSpans.some(span => span.isConnected)) {
            return true; // 已存在且连接到DOM
          } else {
            // 内存中有但DOM中不存在，清理过时的引用
            this.activeSpans.delete(id);
          }
        }
        
        // 检查 DOM 中是否已有高亮元素
        const existingElement = document.querySelector('[data-clipsey-id="' + safeCssEscape(id) + '"]');
        if (existingElement) {
          // DOM中存在但内存中没有，重新注册到内存
          const spans = Array.from(document.querySelectorAll('[data-clipsey-id="' + safeCssEscape(id) + '"]')) as HTMLElement[];
          this.activeSpans.set(id, spans);
          return true;
        }
      }
      
      // 多级定位策略:按优先级尝试不同的定位方法
      let range: Range | null = null;
      
      // 1. 优先使用 textOffset （最精确）
      if (h.textOffset != null && typeof h.textOffset === 'number') {
        range = this.createRangeFromDocumentOffset(h.textOffset, text.length);
      }
      
      // 2. 尝试使用 anchorSelector 缩小搜索范围
      if (!range && h.anchorSelector) {
        try {
          const anchor = document.querySelector(h.anchorSelector);
          if (anchor) {
            range = findTextRangeInNode(anchor, text);
          }
        } catch {
          // 选择器无效,继续尝试其他方法
        }
      }
      
      // 3. 尝试使用上下文匹配
      if (!range && (h.contextBefore || h.contextAfter)) {
        range = this.findRangeByContext(text, h.contextBefore, h.contextAfter);
      }
      
      // 4. 在整个文档中搜索（后备方案）
      if (!range) {
        range = findTextRangeInNode(document.body, text);
      }
      
      if (!range) return false;
      
      const spans = (h.highlightStyle === 'overlay') ? applyOverlay(range) : applyInline(range, id);
      if (spans.length > 0) {
        this.activeSpans.set(id, spans);
      }
      await this.sleep(this.throttled);
      return spans.length > 0;
    });

    const results = await Promise.all(tasks);
    const end = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    this.lastPerf = { durationMs: Math.max(0, end - start), appliedCount: results.filter(Boolean).length };
    return results.some(Boolean);
  }

  /**
   * 通过上下文匹配查找文本范围
   * 用于提高富文本结构中的定位精度
   */
  private findRangeByContext(
    text: string,
    contextBefore?: string,
    contextAfter?: string
  ): Range | null {
    if (!contextBefore && !contextAfter) return null;
    
    const walker = createTextNodeWalker();
    if (!walker) return null;
    
    // 构建完整文本
    const textParts: string[] = [];
    const nodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    
    while (current) {
      if (current instanceof Text) {
        nodes.push(current);
        textParts.push(current.textContent ?? '');
      }
      current = walker.nextNode();
    }
    
    if (!nodes.length) return null;
    
    const fullText = textParts.join('');
    const searchPattern = (contextBefore ?? '') + text + (contextAfter ?? '');
    const index = fullText.indexOf(searchPattern);
    
    if (index === -1) return null;
    
    // 计算目标文本的实际位置
    const textStartIndex = index + (contextBefore?.length ?? 0);
    
    // 将索引映射到具体文本节点
    let remaining = textStartIndex;
    let startNode: Text | null = null;
    let startOffset = 0;
    
    for (const node of nodes) {
      const len = node.textContent?.length ?? 0;
      if (remaining < len) {
        startNode = node;
        startOffset = remaining;
        break;
      }
      remaining -= len;
    }
    
    if (!startNode) return null;
    
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    
    let remainingLength = text.length;
    let endNode: Text = startNode;
    let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
    remainingLength -= (endOffset - startOffset);
    
    let idx = nodes.indexOf(startNode);
    while (remainingLength > 0 && idx + 1 < nodes.length) {
      idx++;
      const nextNode = nodes[idx];
      const len = nextNode.textContent?.length ?? 0;
      if (len === 0) continue;
      
      if (remainingLength <= len) {
        endNode = nextNode;
        endOffset = remainingLength;
        remainingLength = 0;
        break;
      }
      
      remainingLength -= len;
      endNode = nextNode;
      endOffset = len;
    }
    
    range.setEnd(endNode, endOffset);
    return range;
  }

  /**
   * 等待 DOM 就绪
   * 解决动态加载内容导致的时序问题
   * 优化：增加等待时间和更智能的检测机制
   */
  private async waitForDOMReady(): Promise<void> {
    // 如果 document.body 尚未就绪,等待它
    if (!document.body) {
      await new Promise<void>((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
        } else {
          resolve();
        }
      });
    }
    
    // 等待更长时间以确保动态内容加载
    // 使用更智能的策略：检查 document.readyState
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
      // DOM加载完成后额外等待
      await this.sleep(200);
    } else if (document.readyState === 'interactive') {
      // 页面正在加载资源，等待更长时间
      await this.sleep(300);
    } else {
      // 页面已完全加载，稍微等待动态内容
      await this.sleep(150);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createRangeFromDocumentOffset(offset: number, length: number): Range | null {
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

  getLastPerfStats(): { durationMs: number; appliedCount: number } | null {
    return this.lastPerf;
  }


  private clearOldestHighlights(count: number): void {
    const keys = Array.from(this.activeSpans.keys());
    const toRemove = keys.slice(0, count);
    
    for (const key of toRemove) {
      this.undo(key);
    }
  }
}