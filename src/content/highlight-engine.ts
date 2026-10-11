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
  private cache = new HighlightCache();
  private throttled = 8;
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
    this.abort();
    this.cache.clear();
  }

  undo(highlightId: string): boolean {
    this.abort();
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
          ? applyOverlay(highlightRange, highlightId)
          : applyInline(highlightRange, highlightId);
      if (spans.length) {
        this.cache.add(highlightId, spans);
      }
    }

    return true;
  }

  async activateHighlights(highlights: RemoteHighlight[]): Promise<boolean> {
    if (!Array.isArray(highlights)) return false;

    this.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const { signal } = controller;
    await this.waitForDOMReady();
    await ensureHighlightColorsReady().catch(() => {});
    if (signal.aborted) return false;

    const validHighlights = highlights.filter(h => h.textContent?.trim());
    const ids = new Set(validHighlights.map(h => h.highlightId ?? h.id ?? h.textContent!.trim()));
    this.cache.retain(ids);
    const start = this.now();
    let appliedCount = 0;

    for (const h of validHighlights) {
      if (signal.aborted) return false;
      const text = h.textContent!.trim();
      const id = h.highlightId ?? h.id ?? text;
      if (this.cache.has(id)) {
        appliedCount += 1;
        continue;
      }

      const range = LocationStrategy.locate({
        text,
        textOffset: h.textOffset,
        anchorSelector: h.anchorSelector,
        contextBefore: h.contextBefore,
        contextAfter: h.contextAfter
      });
      if (range) {
        const spans = h.highlightStyle === 'overlay'
          ? applyOverlay(range, id)
          : applyInline(range, id);
        if (spans.length) {
          this.cache.add(id, spans);
          appliedCount += 1;
        }
      }

      // 每次定位/绘制后让出主线程，下一项开始前重新检查取消信号。
      await this.sleep(this.throttled);
    }

    if (signal.aborted) return false;
    this.lastPerf = { durationMs: Math.max(0, this.now() - start), appliedCount };
    return validHighlights.length === 0 || appliedCount > 0;
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
