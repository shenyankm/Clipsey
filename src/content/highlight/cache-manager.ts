/** 高亮缓存：管理内存引用、去重与清理。 */
export class HighlightCache {
  private activeSpans: Map<string, HTMLElement[]> = new Map();

  /** 添加高亮元素到缓存。 */
  add(id: string, spans: HTMLElement[]): void {
    if (spans.length > 0) {
      this.activeSpans.set(id, spans);
    }
  }

  /** 检查高亮是否已存在：同时校验内存引用与 DOM 实际元素。 */
  has(id: string): boolean {
    // 检查内存中是否已有
    if (this.activeSpans.has(id)) {
      const existingSpans = this.activeSpans.get(id);
      if (existingSpans && existingSpans.some(span => span.isConnected)) {
        return true; // 已存在且连接到 DOM
      } else {
        // 内存中有但 DOM 中不存在，清理过时的引用
        this.activeSpans.delete(id);
      }
    }
    
    // 检查 DOM 中是否已有高亮元素（使用 CSS 转义）
    const selector = `[data-clipsey-id="${this.escapeCssSelector(id)}"]`;
    const existingElement = document.querySelector(selector);
    if (existingElement) {
      // DOM 中存在但内存中没有，重新注册到内存
      const spans = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
      this.activeSpans.set(id, spans);
      return true;
    }
    
    return false;
  }

  /** 移除指定高亮。 */
  remove(id: string): boolean {
    if (!this.has(id)) return false;
    const spans = this.activeSpans.get(id)!;
    
    for (const span of spans) {
      this.removeSpanFromDOM(span);
    }
    this.activeSpans.delete(id);
    return true;
  }

  /** 同步完整高亮列表，也移除选区采集创建但尚未缓存的高亮。 */
  retain(ids: Set<string>): void {
    const spans = document.querySelectorAll<HTMLElement>('[data-clipsey="true"][data-clipsey-id]');
    for (const span of spans) {
      if (!ids.has(span.dataset.clipseyId!)) this.removeSpanFromDOM(span);
    }
    for (const id of this.activeSpans.keys()) {
      if (!ids.has(id)) this.remove(id);
    }
  }

  clear(): void {
    this.retain(new Set());
    this.activeSpans.clear();
  }

  /** 从 DOM 中移除高亮元素。 */
  private removeSpanFromDOM(span: HTMLElement): void {
    try {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    } catch {
      // ignore
    }
  }

  /** CSS 选择器转义。 */
  private escapeCssSelector(str: string): string {
    return str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  }
}
