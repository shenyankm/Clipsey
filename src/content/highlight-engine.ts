import { ensureHighlightColorsReady } from '@/content/color-manager';
import { applyInline, applyOverlay } from '@/content/highlight/painters';
import { LocationStrategy } from '@/content/highlight/locators';
import { HighlightCache } from '@/content/highlight/cache-manager';
import { ScrollManager } from '@/content/highlight/scroll-manager';
import type { FocusClipPayload } from '@/types/message';

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

/** 高亮引擎：编排定位/渲染/缓存，批量激活或管理高亮，并支持滚动定位。 */
export class HighlightEngine {
  private cache: HighlightCache;
  private throttled = 8;
  private abortController: AbortController | null = null;
  private lastPerf: { durationMs: number; appliedCount: number } | null = null;

  constructor(maxHighlights: number = 200) {
    this.cache = new HighlightCache(maxHighlights);
  }

  setThrottle(ms: number): void {
    this.throttled = Math.max(0, ms | 0);
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  clear(): void {
    this.cache.clear();
  }

  undo(highlightId: string): boolean {
    return this.cache.remove(highlightId);
  }

  async focusClip(payload: FocusClipPayload | undefined): Promise<boolean> {
    const text = payload?.textContent?.trim();
    if (!text) {
      return false;
    }

    await this.waitForDOMReady();

    const highlightId = payload?.highlightId ?? payload?.id ?? text;
    if (highlightId) {
      const existingRange = this.findRangeByHighlightId(highlightId);
      if (existingRange) {
        ScrollManager.scrollIntoView(existingRange);
        return true;
      }
    }

    const locatedRange = LocationStrategy.locate({
      text,
      textOffset: payload?.textOffset,
      anchorSelector: payload?.anchorSelector,
      contextBefore: payload?.contextBefore,
      contextAfter: payload?.contextAfter
    });

    if (!locatedRange) {
      return false;
    }

    const scrollRange = locatedRange.cloneRange();
    ScrollManager.scrollIntoView(scrollRange);

    if (highlightId && !this.cache.has(highlightId)) {
      const highlightStyle = payload?.highlightStyle === 'overlay' ? 'overlay' : 'inline';
      const highlightRange = locatedRange.cloneRange();
      const spans =
        highlightStyle === 'overlay'
          ? applyOverlay(highlightRange)
          : applyInline(highlightRange, highlightId);
      if (spans.length) {
        this.cache.add(highlightId, spans);
      }
    }

    return true;
  }

  async activateHighlights(highlights: RemoteHighlight[]): Promise<boolean> {
    if (!Array.isArray(highlights) || highlights.length === 0) return false;
    
    // 等待 DOM 就绪
    await this.waitForDOMReady();
    
    // 防止内存泄漏：如果超过最大数量，清理旧的
    if (this.cache.shouldCleanup()) {
      this.cache.cleanupOldest(Math.floor(100));
    }
    
    // 确保高亮颜色已准备好
    await ensureHighlightColorsReady().catch(() => {});
    
    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const start = this.now();

    const tasks = highlights.map(async (h) => {
      if (signal.aborted) return false;
      const text = h.textContent?.trim();
      if (!text) return false;
      
      const id = h.highlightId ?? h.id ?? text;
      
      // 检查是否已存在
      if (id && this.cache.has(id)) {
        return true;
      }
      
      // 使用定位策略链
      const range = LocationStrategy.locate({
        text,
        textOffset: h.textOffset,
        anchorSelector: h.anchorSelector,
        contextBefore: h.contextBefore,
        contextAfter: h.contextAfter
      });
      
      if (!range) return false;
      
      // 根据样式选择渲染器
      const spans = (h.highlightStyle === 'overlay') 
        ? applyOverlay(range) 
        : applyInline(range, id);
      
      if (spans.length > 0) {
        this.cache.add(id, spans);
      }
      
      await this.sleep(this.throttled);
      return spans.length > 0;
    });

    const results = await Promise.all(tasks);
    const end = this.now();
    this.lastPerf = { 
      durationMs: Math.max(0, end - start), 
      appliedCount: results.filter(Boolean).length 
    };
    return results.some(Boolean);
  }

  getLastPerfStats(): { durationMs: number; appliedCount: number } | null {
    return this.lastPerf;
  }

  private async waitForDOMReady(): Promise<void> {
    if (!document.body) {
      await new Promise<void>((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
        } else {
          resolve();
        }
      });
    }
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
      await this.waitIdle(100);
    } else {
      await this.waitIdle(50);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private waitIdle(ms: number): Promise<void> {
    return new Promise(resolve => {
      const w = (globalThis as any);
      const ric = w && w.requestIdleCallback;
      if (typeof ric === 'function') {
        try {
          ric(() => resolve(), { timeout: ms });
          return;
        } catch {}
      }
      setTimeout(resolve, ms);
    });
  }

  private now(): number {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  private findRangeByHighlightId(id: string): Range | null {
    try {
      const selector = `[data-clipsey-id="${this.escapeCssSelector(id)}"]`;
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      return range;
    } catch {
      return null;
    }
  }

  private escapeCssSelector(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  }
}
