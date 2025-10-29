import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightEngine } from '@/content/highlight-engine';

describe('HighlightEngine', () => {
  let engine: HighlightEngine;

  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <p id="p1">Hello Clipsey, this is a test paragraph.</p>
        <p id="p2">Another line with more text to highlight.</p>
      </div>
    `;
    engine = new HighlightEngine();
  });

  it('focuses clip by text content using TreeWalker + Range', async () => {
    const ok = await engine.focusClip({ textContent: 'test paragraph' });
    expect(ok).toBe(true);
  });

  it('activates inline highlights for given payloads', async () => {
    const ok = await engine.activateHighlights([
      { id: 'h1', textContent: 'Clipsey' },
      { id: 'h2', textContent: 'more text' }
    ]);
    expect(ok).toBe(true);
    const spans = document.querySelectorAll('.clipsey-inline-highlight');
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it('can undo a specific highlight by id', async () => {
    await engine.activateHighlights([{ id: 'h3', textContent: 'Clipsey' }]);
    const before = document.querySelectorAll('.clipsey-inline-highlight').length;
    expect(before).toBeGreaterThanOrEqual(1);
    const undone = engine.undo('h3');
    expect(undone).toBe(true);
    const after = document.querySelectorAll('.clipsey-inline-highlight').length;
    expect(after).toBe(0);
  });

  it('clear() removes all active highlights', async () => {
    await engine.activateHighlights([
      { id: 'h1', textContent: 'Clipsey' },
      { id: 'h2', textContent: 'paragraph' }
    ]);
    expect(document.querySelectorAll('.clipsey-inline-highlight').length).toBeGreaterThanOrEqual(2);
    engine.clear();
    expect(document.querySelectorAll('.clipsey-inline-highlight').length).toBe(0);
  });
});