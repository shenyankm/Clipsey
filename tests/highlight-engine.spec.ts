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
});