import { ensureHighlightColorsReady } from '@/content/color-manager';
import { applyInline, applyOverlay } from '@/content/highlight/painters';
import { LocationStrategy } from '@/content/highlight/locators';
import { locateByOffsets } from '@/content/highlight/locators/offset-locator';
import { findTextRangeInNode, normalizeWhitespace } from '@/content/highlight/text-search';
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
  private throttled = 0;
  private lastTimerYield = 0;
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
    this.lastTimerYield = start;
    let appliedCount = 0;

    const offsetTargets = validHighlights.filter(h =>
      Number.isSafeInteger(h.textOffset) && h.textOffset! >= 0 &&
      !this.cache.has(h.highlightId ?? h.id ?? h.textContent!.trim())
    );
    let preparedValid = true;
    const observer = offsetTargets.length > 1 ? new MutationObserver(() => { preparedValid = false; }) : null;
    observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    const prepared = new Map<RemoteHighlight, Range | null>();
    if (observer) {
      const ranges = locateByOffsets(offsetTargets.map(h => ({ offset: h.textOffset!, length: h.textContent!.trim().length })));
      offsetTargets.forEach((h, index) => prepared.set(h, ranges[index] ?? null));
    }

    let channel: MessageChannel | undefined;
    try {
      if (this.throttled === 0 && typeof globalThis.scheduler?.postTask !== 'function' &&
          typeof MessageChannel === 'function' && prepared.size) channel = new MessageChannel();
      for (const h of validHighlights) {
        if (signal.aborted) return false;
        const text = h.textContent!.trim();
        const id = h.highlightId ?? h.id ?? text;
        if (this.cache.has(id)) {
          appliedCount += 1;
          continue;
        }

        if (observer?.takeRecords().length) preparedValid = false;
        let range = preparedValid ? prepared.get(h) : null;
        if (range) {
          const root = range.commonAncestorContainer;
          const current = findTextRangeInNode(root instanceof Text ? root.parentElement! : root, text, false);
          if (!root.isConnected || normalizeWhitespace(range.toString()) !== normalizeWhitespace(text) ||
              current?.startContainer !== range.startContainer || current?.startOffset !== range.startOffset ||
              current?.endContainer !== range.endContainer || current?.endOffset !== range.endOffset) range = null;
        }
        const preparedOffset = !!range;
        range ??= LocationStrategy.locate({
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

        // 本次绘制的同步 DOM 修改不使其他实时 Range 失效；外部修改会触发回退。
        observer?.takeRecords();
        // 每次定位/绘制后让出主线程，下一项开始前重新检查取消信号。
        await this.sleep(this.throttled, signal, preparedOffset ? channel : undefined);
      }

      if (signal.aborted) return false;
      this.lastPerf = { durationMs: Math.max(0, this.now() - start), appliedCount };
      return validHighlights.length === 0 || appliedCount > 0;
    } finally {
      channel?.port1.close();
      channel?.port2.close();
      observer?.disconnect();
    }
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

  private sleep(ms: number, signal: AbortSignal, channel?: MessageChannel): Promise<void> {
    // 恢复批次不应优先于页面的取消定时器与绘制。
    if (ms === 0 && typeof globalThis.scheduler?.postTask === 'function') {
      return globalThis.scheduler.postTask(() => {}, { priority: 'background', signal })
        .catch(error => { if (!signal.aborted) throw error; });
    }
    // 仅预定位范围避开逐项定时器延迟；完整扫描保留原边界，每 8ms 仍让出一次定时器任务。
    if (ms === 0 && channel && this.now() - this.lastTimerYield < 8) {
      return new Promise(resolve => {
        const finish = () => {
          signal.removeEventListener('abort', finish);
          channel.port1.onmessage = null;
          resolve();
        };
        channel.port1.onmessage = finish;
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted) finish();
        else channel.port2.postMessage(null);
      });
    }
    this.lastTimerYield = this.now();
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
