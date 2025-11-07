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
import {
  ensureHighlightColorsReady,
  HIGHLIGHT_INLINE_CLASS as INLINE_CLASS,
  HIGHLIGHT_OVERLAY_CLASS as OVERLAY_CLASS
} from '@/content/color-manager';

function createTextNodeWalker(root: Node = document.body): TreeWalker | null {
  if (!root) return null;
  try {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const style = getComputedStyle(parent);
        if (style && (style.visibility === 'hidden' || style.display === 'none')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
  } catch {
    return null;
  }
}

function safeCssEscape(value: string): string {
  try {
    // 运行时支持 CSS.escape 时使用原生；否则做最小转义
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
  } catch {}
  return String(value).replace(/["\\]/g, '\\$&');
}

/**
 * 在指定根节点下查找文本范围，支持跨多个文本节点与嵌套富文本结构。
 * 为避免破坏原有富文本结构，仅定位 Range，不做变更。
 * 
 * 优化要点:
 * 1. 支持富文本结构中的文本查找
 * 2. 跨元素精确定位（如 <strong>、<em> 等标签）
 * 3. 忽略空白字符差异,提升匹配成功率
 */
function findTextRangeInNode(root: Node, text: string): Range | null {
  if (!root) return null;
  const query = text.trim();
  if (!query) return null;

  // 收集根节点下的文本节点，并构建顺序文本缓冲
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // 排除脚本、样式等不可见元素
      if (parent.closest('script, style, noscript, svg, canvas')) {
        return NodeFilter.FILTER_REJECT;
      }
      const content = (node as Text).textContent ?? '';
      if (!content.trim()) {
        return NodeFilter.FILTER_SKIP;
      }
      // 检查元素是否可见
      try {
        const style = getComputedStyle(parent);
        if (style && (style.visibility === 'hidden' || style.display === 'none')) {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // 某些节点可能无法获取样式,继续处理
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  const buffer: string[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    const t = current as Text;
    textNodes.push(t);
    buffer.push(t.textContent ?? '');
    current = walker.nextNode();
  }

  if (!textNodes.length) return null;

  // 使用normalize后的文本进行匹配,提升匹配成功率
  const combined = buffer.join('');
  const normalizedCombined = normalizeWhitespace(combined);
  const normalizedQuery = normalizeWhitespace(query);
  
  // 先尝试精确匹配
  let index = combined.toLowerCase().indexOf(query.toLowerCase());
  
  // 如果精确匹配失败,尝试规范化后匹配
  if (index === -1) {
    index = normalizedCombined.toLowerCase().indexOf(normalizedQuery.toLowerCase());
    if (index === -1) return null;
    // 将规范化索引映射回原始文本索引
    index = mapNormalizedIndexToOriginal(combined, normalizedCombined, index);
  }

  // 将合并索引映射回具体文本节点的起止位置
  let remaining = index;
  let startNode: Text | null = null;
  let startOffset = 0;
  for (const tn of textNodes) {
    const len = tn.textContent?.length ?? 0;
    if (remaining < len) {
      startNode = tn;
      startOffset = remaining;
      break;
    }
    remaining -= len;
  }
  if (!startNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);

  let remainingLength = query.length;
  let endNode: Text = startNode;
  let endOffset = Math.min(startOffset + remainingLength, startNode.textContent?.length ?? 0);
  remainingLength -= endOffset - startOffset;

  let idx = textNodes.indexOf(startNode);
  while (remainingLength > 0 && idx + 1 < textNodes.length) {
    idx += 1;
    const nextNode = textNodes[idx];
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
 * 规范化空白字符,将连续空白替换为单个空格
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 将规范化文本中的索引映射回原始文本索引
 */
function mapNormalizedIndexToOriginal(
  original: string,
  _normalized: string,
  normalizedIndex: number
): number {
  let originalIndex = 0;
  let normalizedCount = 0;
  let inWhitespace = false;

  for (let i = 0; i < original.length && normalizedCount < normalizedIndex; i++) {
    const char = original[i];
    const isWhitespace = /\s/.test(char);

    if (isWhitespace) {
      if (!inWhitespace) {
        normalizedCount++;
        inWhitespace = true;
      }
    } else {
      normalizedCount++;
      inWhitespace = false;
    }
    originalIndex++;
  }

  return originalIndex;
}

/**
 * 应用内联高亮：在选中文本外包裹高亮元素
 * 颜色通过 CSS 变量统一管理，不在此处硬编码
 */
/**
 * 创建高亮元素，保留富文本结构与可访问性标识
 */
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

/**
 * 收集Range中的所有文本节点片段
 * 优化:正确处理富文本结构,避免重复高亮
 */
function collectSegments(range: Range): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  
  while (current) {
    const textNode = current as Text;
    
    // 检查节点是否在range范围内
    if (!range.intersectsNode(textNode)) {
      current = walker.nextNode();
      continue;
    }
    
    // 跳过已高亮内容，避免重复包裹
    if (textNode.parentElement?.closest('[data-clipsey-id]')) {
      current = walker.nextNode();
      continue;
    }
    
    // 跳过不可见元素
    const parent = textNode.parentElement;
    if (parent) {
      try {
        const style = getComputedStyle(parent);
        if (style.visibility === 'hidden' || style.display === 'none') {
          current = walker.nextNode();
          continue;
        }
      } catch {
        // 忽略样式获取错误
      }
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

function applyInline(range: Range, id?: string): HTMLElement[] {
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
  // 如果未能分段包裹，则尝试整体包裹一次
  if (!created.length) {
    const span = wrapSegment(range, id);
    if (span) created.push(span);
  }
  return created;
}

/**
 * 应用覆盖层高亮：创建浮动遮罩层覆盖在选中文本上
 * 颜色通过 CSS 变量统一管理，不在此处硬编码
 */
function applyOverlay(range: Range): HTMLElement[] {
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

function scrollRangeIntoView(range: Range): void {
  try {
    const rect = range.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, rect.top + window.scrollY - 16);
    window.scrollTo({ top: y, behavior: 'smooth' });
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
      // 如果已有相同高亮存在，避免重复应用
      if (id && document.querySelector('[data-clipsey-id="' + safeCssEscape(id) + '"]')) {
        return true;
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
    
    // 额外等待一小段时间,确保动态内容也加载完成
    await this.sleep(100);
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