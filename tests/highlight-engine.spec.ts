import { describe, it, expect, beforeEach } from 'vitest';
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