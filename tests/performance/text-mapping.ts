import { findTextRangeInNode } from '../../src/content/highlight/text-search';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];
try {
  for (let code = 0; code <= 0xff; code++) {
    const char = String.fromCharCode(code);
    assert(char.toLowerCase().length === 1, 'Latin-1 case expansion changed');
    assert(/\s/.test(char) === [9, 10, 11, 12, 13, 32, 160].includes(code), 'Latin-1 whitespace changed');
  }
  // 只替代设置传输，生产文本定位与绘制不变。
  (globalThis as any).chrome = {
    runtime: { sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ success: false }); return Promise.resolve({ success: false });
    } },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {}, removeListener() {} } }
  };
  const { HighlightEngine } = await import('../../src/content/highlight-engine');
  const query = new URLSearchParams(location.search);
  const reverse = query.has('reverse');
  const allocations: unknown[] = [];
  function addAllocationCase(paragraphs: number, layout: string, html: string, index: number, quote: string) {
    allocations.push({ paragraphs, name: `${layout}-tail-search`,
      prepare() { document.body.innerHTML = html; },
      operation() {
        const node = document.querySelector(`#q-${index}`)!.firstChild!;
        const range = findTextRangeInNode(document.body, quote.toLowerCase());
        assert(range?.toString() === quote && range.startContainer === node && range.startOffset === 0 && range.endContainer === node && range.endOffset === node.textContent!.length, 'Wrong allocation-case range');
      }
    });
  }
  const results = [];
  const layouts = ['latin1', 'chinese', 'unicode', 'sparse-whitespace'] as const;
  for (const paragraphs of reverse ? [10000, 100] : [100, 10000]) for (const layout of reverse ? [...layouts].reverse() : layouts) {
    const fixture = document.createElement('article');
    const quotes: string[] = [], texts: Text[] = [];
    for (let i = 0; i < paragraphs; i++) {
      const p = document.createElement('p');
      const latin1 = layout === 'latin1' || layout === 'sparse-whitespace';
      const prefix = latin1 ? `Paragraph ${i} Café naïve Über prefix `
        : layout === 'chinese' ? `这是第 ${i} 段，中文背景与英文 English 混排。 `
        : `İΣΟΣ𐐀🙂 第 ${i} 段\u00a0\u3000prefix\t\n `;
      const quote = latin1 ? `QUOTE-${i}!` : layout === 'chinese' ? `摘录-${i} 中文🙂` : `İSTANBUL\u2003\u3000${i}!🙂`;
      const strong = document.createElement('strong'); strong.id = `q-${i}`; strong.textContent = quote;
      const em = document.createElement('em'); em.textContent = latin1 ? 'emphasis' : '后文与 Café';
      p.append(prefix, strong, ' tail text ', em, layout === 'unicode' ? '\u202f 中文\u2028' : ' final text ');
      if (layout === 'sparse-whitespace' && i === paragraphs - 1) p.append('\t');
      fixture.append(p); quotes.push(quote); texts.push(strong.firstChild as Text);
    }
    const original = fixture.textContent;
    document.body.replaceChildren(fixture);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    function search(index: number) {
      const range = findTextRangeInNode(document.body, index < 0 ? 'missing-unique-quote!' : quotes[index]!.toLowerCase());
      if (index < 0) assert(range === null, 'Unexpected missing match');
      else assert(range?.toString() === quotes[index] && range.startContainer === texts[index] && range.startOffset === 0 && range.endContainer === texts[index] && range.endOffset === texts[index]!.length, 'Wrong range or Unicode boundary');
    }
    const searches = [];
    for (const index of [10, Math.floor(paragraphs / 2), paragraphs - 10, -1]) {
      search(index); const samplesMs = [];
      for (let i = 0; i < 7; i++) { const start = performance.now(); search(index); samplesMs.push(performance.now() - start); }
      searches.push({ index, medianMs: median(samplesMs), samplesMs });
    }
    if (query.has('allocations')) {
      const index = paragraphs - 10;
      addAllocationCase(paragraphs, layout, fixture.outerHTML, index, quotes[index]!);
    }
    const positions = Array.from({ length: 20 }, (_, i) => Math.floor(paragraphs * (0.05 + i * 0.045)));
    if (reverse) positions.reverse();
    const highlights = positions.map(i => ({ highlightId: `fixture-${i}`, textContent: quotes[i] }));
    async function activate() {
      document.body.replaceChildren(fixture.cloneNode(true));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const engine = new HighlightEngine(); const start = performance.now();
      assert(await engine.activateHighlights(highlights), 'Activation failed');
      const wallMs = performance.now() - start;
      assert(engine.getLastPerfStats()?.appliedCount === highlights.length && document.querySelectorAll('[data-clipsey-id]').length === highlights.length, 'Lost highlights');
      for (const i of positions) assert(document.querySelector(`#q-${i} [data-clipsey-id="fixture-${i}"]`)?.textContent === quotes[i], 'Wrong painted Unicode target');
      assert(document.body.textContent === original, 'Painting changed text');
      engine.clear(); assert(document.body.textContent === original && !document.querySelector('[data-clipsey-id]'), 'Clear changed text');
      return { wallMs, durationMs: engine.getLastPerfStats()!.durationMs };
    }
    await activate(); const samples = [];
    for (let i = 0; i < 7; i++) samples.push(await activate());
    results.push({ paragraphs, layout, searches, fallbackActivation: { wallMedianMs: median(samples.map(s => s.wallMs)), durationMedianMs: median(samples.map(s => s.durationMs)), samples } });
  }
  (window as any).__highlightAllocationCases = allocations;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'text-mapping', reverse, fixtureSettledFrames: 2, latin1CodeUnitsVerified: 256, results };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
