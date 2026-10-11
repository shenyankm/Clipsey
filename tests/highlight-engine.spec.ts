import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocationStrategy } from '@/content/highlight/locators';
import { HighlightEngine } from '@/content/highlight-engine';
import { ensureHighlightColorsReady, HIGHLIGHT_INLINE_CLASS } from '@/content/color-manager';

describe('HighlightEngine 基本功能', () => {
  let engine: HighlightEngine;

  beforeEach(async () => {
    // 重置文档内容
    document.body.innerHTML = `
      <main>
        <h1>测试页面</h1>
        <p>这是用于单元测试的段落，其中包含关键词：Vitest 高亮。</p>
        <div>
          <span>另一个文本节点，包含 Vitest 关键字。</span>
        </div>
      </main>
    `;
    engine = new HighlightEngine();
    await ensureHighlightColorsReady();
  });

  afterEach(() => {
    engine.abort();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('同步时移除已删除的高亮，保留其余高亮', async () => {
    const first = { textContent: 'Vitest', highlightId: 'first' };
    const second = { textContent: '另一个文本节点', highlightId: 'second' };
    await engine.activateHighlights([first, second]);
    await engine.activateHighlights([second]);
    expect(document.querySelector('[data-clipsey-id="first"]')).toBeNull();
    expect(document.querySelector('[data-clipsey-id="second"]')).not.toBeNull();
    expect(await engine.activateHighlights([])).toBe(true);
    expect(document.querySelector('[data-clipsey-id]')).toBeNull();
  });

  it('删除未注册到引擎缓存的选区高亮时保留原文', () => {
    document.body.innerHTML = '<p><span data-clipsey="true" data-clipsey-id="selection">摘录</span></p>';
    expect(engine.undo('selection')).toBe(true);
    expect(document.querySelector('[data-clipsey-id]')).toBeNull();
    expect(document.body.textContent).toBe('摘录');
  });

  it('重复激活覆盖层不会重复创建，空列表会清除覆盖层', async () => {
    const highlights = [{ textContent: 'Vitest', highlightId: 'overlay', highlightStyle: 'overlay' as const }];
    await engine.activateHighlights(highlights);
    const count = document.querySelectorAll('[data-clipsey-id="overlay"]').length;
    expect(count).toBeGreaterThan(0);
    await engine.activateHighlights(highlights);
    expect(document.querySelectorAll('[data-clipsey-id="overlay"]')).toHaveLength(count);
    await engine.activateHighlights([]);
    expect(document.querySelector('[data-clipsey-id="overlay"]')).toBeNull();
  });

  it('批量高亮在各项之间让出主线程并响应取消', async () => {
    vi.useFakeTimers();
    const locate = vi.spyOn(LocationStrategy, 'locate');
    const pending = engine.activateHighlights([
      { textContent: 'Vitest', highlightId: 'first' },
      { textContent: '另一个文本节点', highlightId: 'second' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    expect(locate).toHaveBeenCalledTimes(1);
    engine.abort();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(locate).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-clipsey-id="second"]')).toBeNull();
  });

  it('uses the native scheduling boundary and can abort before the next highlight', async () => {
    vi.useFakeTimers();
    let resume!: () => void;
    const yieldTask = vi.fn(() => new Promise<void>(resolve => { resume = resolve; }));
    vi.stubGlobal('scheduler', { postTask: yieldTask });
    const pending = engine.activateHighlights([
      { textContent: 'Vitest', highlightId: 'first' },
      { textContent: '另一个文本节点', highlightId: 'second' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    expect(yieldTask).toHaveBeenCalledTimes(1);
    expect(yieldTask).toHaveBeenCalledWith(expect.any(Function), { priority: 'background', signal: expect.any(AbortSignal) });
    expect(document.querySelector('[data-clipsey-id="first"]')).not.toBeNull();
    expect(document.querySelector('[data-clipsey-id="second"]')).toBeNull();
    engine.abort(); resume();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(document.querySelector('[data-clipsey-id="second"]')).toBeNull();
  });

  it('keeps an explicit positive throttle when native scheduling is available', async () => {
    vi.useFakeTimers();
    const yieldTask = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { postTask: yieldTask });
    engine.setThrottle(12);
    const pending = engine.activateHighlights([
      { textContent: 'Vitest', highlightId: 'first' },
      { textContent: '另一个文本节点', highlightId: 'second' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    await vi.advanceTimersByTimeAsync(11);
    expect(document.querySelector('[data-clipsey-id="second"]')).toBeNull();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(true);
    expect(document.querySelector('[data-clipsey-id="second"]')).not.toBeNull();
    expect(yieldTask).not.toHaveBeenCalled();
  });

  it('uses timer yielding when the scheduler has no postTask method', async () => {
    vi.stubGlobal('scheduler', {});
    expect(await engine.activateHighlights([{ textContent: 'Vitest', highlightId: 'timer' }])).toBe(true);
    expect(document.querySelector('[data-clipsey-id="timer"]')?.textContent).toBe('Vitest');
  });

  it('disconnects a prepared batch when its queued task is aborted without executing', async () => {
    document.body.innerHTML = '<p>one two</p>';
    vi.useFakeTimers();
    vi.stubGlobal('scheduler', { postTask: (_callback: () => void, { signal }: { signal: AbortSignal }) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }) });
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const pending = engine.activateHighlights([
      { textContent: 'one', textOffset: 0, highlightId: 'one' },
      { textContent: 'two', textOffset: 4, highlightId: 'two' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    expect(document.querySelector('[data-clipsey-id="one"]')).not.toBeNull();
    engine.abort();
    expect(await pending).toBe(false);
    expect(document.querySelector('[data-clipsey-id="two"]')).toBeNull();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves unexpected scheduling failures and disconnects the observer', async () => {
    document.body.innerHTML = '<p>one two</p>';
    const failure = new Error('Scheduling failed');
    vi.stubGlobal('scheduler', { postTask: () => Promise.reject(failure) });
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    await expect(engine.activateHighlights([
      { textContent: 'one', textOffset: 0, highlightId: 'one' },
      { textContent: 'two', textOffset: 4, highlightId: 'two' }
    ])).rejects.toBe(failure);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('prepares offsets once and keeps ranges valid after wrapping another quote in the same text node', async () => {
    document.body.innerHTML = '<p>one two three</p>';
    const locate = vi.spyOn(LocationStrategy, 'locate');
    expect(await engine.activateHighlights([
      { textContent: 'three', textOffset: 8, highlightId: 'three' },
      { textContent: 'one', textOffset: 0, highlightId: 'one' },
      { textContent: 'two', textOffset: 4, highlightId: 'two' }
    ])).toBe(true);
    expect(document.body.textContent).toBe('one two three');
    for (const id of ['one', 'two', 'three']) expect(document.querySelector(`[data-clipsey-id="${id}"]`)?.textContent).toBe(id);
    expect(locate).not.toHaveBeenCalled();
  });

  it('invalidates prepared offsets when external content is inserted between items', async () => {
    document.body.innerHTML = '<p>prefix <b>one</b> middle <i>two</i></p>';
    vi.useFakeTimers();
    const locate = vi.spyOn(LocationStrategy, 'locate');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const pending = engine.activateHighlights([
      { textContent: 'one', textOffset: 7, highlightId: 'one' },
      { textContent: 'two', textOffset: 18, highlightId: 'two' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    expect(document.querySelector('[data-clipsey-id="one"]')).not.toBeNull();
    const prefix = document.createElement('p');
    prefix.textContent = 'new prefix';
    document.body.prepend(prefix);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(true);
    expect(locate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'two' }));
    expect(document.querySelector('i [data-clipsey-id="two"]')?.textContent).toBe('two');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels a prepared batch before its next item and disconnects observation', async () => {
    document.body.innerHTML = '<p>one two</p>';
    vi.useFakeTimers();
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const pending = engine.activateHighlights([
      { textContent: 'one', textOffset: 0, highlightId: 'one' },
      { textContent: 'two', textOffset: 4, highlightId: 'two' }
    ]);
    await vi.advanceTimersByTimeAsync(51);
    engine.abort();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(document.querySelector('[data-clipsey-id="two"]')).toBeNull();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('activateHighlights: 能为匹配文本应用内联高亮', async () => {
    const ok = await engine.activateHighlights([
      { textContent: 'Vitest', highlightStyle: 'inline' }
    ]);
    expect(ok).toBe(true);
    const spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(spans.length).toBeGreaterThan(0);
  });

  it('clear: 能清除已应用的内联高亮并恢复原始 DOM', async () => {
    const applied = await engine.activateHighlights([
      { textContent: 'Vitest', highlightStyle: 'inline', highlightId: 'h1' }
    ]);
    expect(applied).toBe(true);
    // 确认已有高亮
    expect(document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`).length).toBeGreaterThan(0);
    // 清理
    engine.clear();
    // 验证高亮被移除
    expect(document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`).length).toBe(0);
  });

  it('activateHighlights: 能为页面中的多个相同文本分别应用高亮', async () => {
    // 重置文档，包含多个相同的"摘要"文本
    document.body.innerHTML = `
      <main>
        <h1>文章标题</h1>
        <div class="summary">摘要：这是第一段摘要内容</div>
        <p>正文内容...</p>
        <div class="summary">摘要：这是第二段摘要内容</div>
        <p>更多正文...</p>
        <div class="summary">摘要：这是第三段摘要内容</div>
      </main>
    `;

    // 为三个不同的"摘要"元素分别创建高亮
    const ok = await engine.activateHighlights([
      { textContent: '摘要', highlightStyle: 'inline', highlightId: 'summary-1' },
      { textContent: '摘要', highlightStyle: 'inline', highlightId: 'summary-2' },
      { textContent: '摘要', highlightStyle: 'inline', highlightId: 'summary-3' }
    ]);

    expect(ok).toBe(true);
    
    // 验证所有三个"摘要"都被高亮了
    const highlightedSpans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(highlightedSpans.length).toBe(3);

    // 验证每个高亮都有唯一的 ID
    const ids = Array.from(highlightedSpans).map(span => span.getAttribute('data-clipsey-id'));
    expect(ids).toContain('summary-1');
    expect(ids).toContain('summary-2');
    expect(ids).toContain('summary-3');

    // 验证每个高亮的文本内容
    highlightedSpans.forEach(span => {
      expect(span.textContent).toBe('摘要');
    });
  });

  it('activateHighlights: 页面刷新后能正确恢复所有高亮', async () => {
    // 初始页面内容
    const originalHTML = `
      <main>
        <h1>测试页面</h1>
        <div class="section">第一段内容包含关键词：测试高亮。</div>
        <div class="section">第二段内容也有：测试高亮。</div>
      </main>
    `;
    
    document.body.innerHTML = originalHTML;

    // 第一次应用高亮
    const highlights = [
      { textContent: '测试高亮', highlightStyle: 'inline' as const, highlightId: 'hl-1' },
      { textContent: '测试高亮', highlightStyle: 'inline' as const, highlightId: 'hl-2' }
    ];
    
    let ok = await engine.activateHighlights(highlights);
    expect(ok).toBe(true);
    
    let spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(spans.length).toBe(2);

    // 模拟页面刷新：清空并重新设置 HTML
    engine.clear();
    document.body.innerHTML = originalHTML;
    
    // 等待一小段时间模拟真实情况
    await new Promise(resolve => setTimeout(resolve, 50));

    // 重新应用高亮（模拟页面加载后的自动恢复）
    ok = await engine.activateHighlights(highlights);
    expect(ok).toBe(true);
    
    // 验证高亮已恢复
    spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(spans.length).toBe(2);
    
    // 验证 highlightId 正确
    const ids = Array.from(spans).map(s => s.getAttribute('data-clipsey-id'));
    expect(ids).toContain('hl-1');
    expect(ids).toContain('hl-2');
  });
});
