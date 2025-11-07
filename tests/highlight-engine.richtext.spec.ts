import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightEngine } from '@/content/highlight-engine';
import { ensureHighlightColorsReady, HIGHLIGHT_INLINE_CLASS, HIGHLIGHT_OVERLAY_CLASS } from '@/content/color-manager';

describe('HighlightEngine 富文本支持', () => {
  let engine: HighlightEngine;

  beforeEach(async () => {
    document.body.innerHTML = '';
    engine = new HighlightEngine();
    await ensureHighlightColorsReady();
  });

  it('跨元素高亮：在 <strong> 与 <em> 之间跨越', async () => {
    document.body.innerHTML = `
      <p>内容含有 <strong>加粗</strong>与<em>斜体</em> 文本。</p>
    `;
    const ok = await engine.activateHighlights([
      { textContent: '加粗与斜体', highlightStyle: 'inline', highlightId: 'rich-1' }
    ]);
    expect(ok).toBe(true);
    const spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    // 预期在 strong 文本、p 文本节点中的“与”、em 文本均各生成一个高亮
    expect(spans.length).toBeGreaterThanOrEqual(2);
    // 确认不破坏原有标签结构
    const strong = document.querySelector('strong');
    const em = document.querySelector('em');
    expect(strong).not.toBeNull();
    expect(em).not.toBeNull();
  });

  it('超链接文本高亮不破坏 href 属性', async () => {
    document.body.innerHTML = `
      <p>请访问 <a href="#test">Vitest 官网</a> 获取更多信息。</p>
    `;
    const ok = await engine.activateHighlights([
      { textContent: 'Vitest 官网', highlightStyle: 'inline', highlightId: 'link-1' }
    ]);
    expect(ok).toBe(true);
    const anchor = document.querySelector('a') as HTMLAnchorElement | null;
    expect(anchor?.getAttribute('href')).toBe('#test');
    const withinLink = anchor?.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`).length ?? 0;
    expect(withinLink).toBeGreaterThan(0);
  });

  it('跨段落高亮：跨越多个 <p> 元素', async () => {
    document.body.innerHTML = `
      <p>第一段 Hello</p>
      <p>World 第二段</p>
    `;
    const ok = await engine.activateHighlights([
      { textContent: 'HelloWorld', highlightStyle: 'inline', highlightId: 'para-1' }
    ]);
    expect(ok).toBe(true);
    const spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it('跨表格单元格高亮：跨越多个 <td>', async () => {
    document.body.innerHTML = `
      <table><tr><td>表格</td><td>内容</td></tr></table>
    `;
    const ok = await engine.activateHighlights([
      { textContent: '表格内容', highlightStyle: 'inline', highlightId: 'table-1' }
    ]);
    expect(ok).toBe(true);
    const spans = document.body.querySelectorAll(`.${HIGHLIGHT_INLINE_CLASS}`);
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it('覆盖层高亮：跨元素范围生成多个 overlay', async () => {
    document.body.innerHTML = `
      <p><b>跨</b><i>元素</i>测试</p>
    `;
    const ok = await engine.activateHighlights([
      { textContent: '跨元素', highlightStyle: 'overlay', highlightId: 'overlay-1' }
    ]);
    expect(ok).toBe(true);
    const overlays = document.body.querySelectorAll(`.${HIGHLIGHT_OVERLAY_CLASS}`);
    expect(overlays.length).toBeGreaterThan(0);
    // overlay 不可交互
    overlays.forEach(el => {
      expect((el as HTMLElement).style.pointerEvents).toBe('none');
    });
  });
});