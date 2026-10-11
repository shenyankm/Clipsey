import { captureHighlightMetadata } from '../../src/content/highlight/metadata';
import { LocationStrategy } from '../../src/content/highlight/locators';
import * as offsetLocator from '../../src/content/highlight/locators/offset-locator';
import { findTextRangeInNode } from '../../src/content/highlight/text-search';
import { createTextNodeWalker } from '../../src/content/highlight/dom-utils';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let styleReads = 0;
const readStyle = window.getComputedStyle;
window.getComputedStyle = (...args) => { styleReads++; return readStyle(...args); };

function measure(operation: () => void) {
  operation();
  const samplesMs = [];
  styleReads = 0;
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    operation();
    samplesMs.push(performance.now() - start);
  }
  return { medianMs: samplesMs.toSorted((a, b) => a - b)[3], samplesMs, styleReadsPerSample: styleReads / 7 };
}

try {
  // 只替代设置传输，定位、真实 DOM 绘制与默认逐项让出主线程均保留。
  (globalThis as any).chrome = {
    runtime: { sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
      const response = { success: false };
      callback?.(response);
      return Promise.resolve(response);
    } },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {}, removeListener() {} } }
  };
  const { HighlightEngine } = await import('../../src/content/highlight-engine');
  const results = [];
  const allocationCases: unknown[] = [];
  function addAllocationCase(scale: { paragraphs?: number; hiddenParagraphs?: number; emptyContainers?: number }, name: string, html: string, query: string) {
    allocationCases.push({ ...scale, name,
      prepare() { document.body.innerHTML = html; },
      operation() { assert(findTextRangeInNode(document.body, query)?.toString() === query, 'Wrong allocation-case match'); }
    });
  }
  const allocations = new URLSearchParams(location.search).has('allocations');
  const reverse = new URLSearchParams(location.search).has('reverse');
  for (const paragraphs of reverse ? [10000, 100] : [100, 10000]) for (const fragmented of reverse ? [true, false] : [false, true]) {
    const fixture = document.createElement('article');
    const texts = [];
    const offsets = [];
    let totalLength = 0;
    for (let i = 0; i < paragraphs; i++) {
      const p = document.createElement('p');
      const prefix = `Paragraph ${i} prefix `;
      const quote = `quote-${i}`;
      p.append(prefix);
      offsets.push(totalLength + prefix.length);
      const strong = document.createElement('strong');
      strong.textContent = quote;
      p.append(strong, ' tail text ');
      if (fragmented) {
        const em = document.createElement('em');
        em.textContent = 'emphasis';
        p.append(em, ' final text ');
      }
      totalLength += p.textContent!.length;
      texts.push(strong.firstChild as Text);
      fixture.append(p);
    }
    document.body.replaceChildren(fixture);
    const fullText = fixture.textContent!;
    if (allocations) addAllocationCase({ paragraphs }, fragmented ? 'fragmented-tail-search' : 'simple-tail-search', fixture.outerHTML, `quote-${paragraphs - 10}`);
    const captures = [];
    for (const index of [10, Math.floor(paragraphs / 2), paragraphs - 10]) {
      const range = document.createRange();
      range.selectNodeContents(texts[index]!);
      captures.push({ index, ...measure(() => {
        const data = captureHighlightMetadata(range, null, 'fixture');
        const offset = offsets[index]!;
        assert(data?.textOffset === offset, 'Wrong metadata offset');
        assert(data.contextBefore === fullText.slice(Math.max(0, offset - 64), offset), 'Wrong preceding context');
        assert(data.contextAfter === fullText.slice(offset + range.toString().length, offset + range.toString().length + 64), 'Wrong following context');
      }) });
    }
    const positions = Array.from({ length: 20 }, (_, i) => Math.floor(paragraphs * (0.05 + i * 0.045)));
    if (reverse) positions.reverse();
    const textSearch = [10, Math.floor(paragraphs / 2), paragraphs - 10, -1].map(index => ({
      index, ...measure(() => {
        const range = findTextRangeInNode(document.body, index < 0 ? 'missing-quote' : `quote-${index}`);
        assert(index < 0 ? range === null : range?.toString() === `quote-${index}` && range.startContainer === texts[index], 'Wrong fallback text match');
      })
    }));
    const restore = measure(() => {
      const ranges = 'locateByOffsets' in offsetLocator
        ? offsetLocator.locateByOffsets(positions.map(index => ({ offset: offsets[index]!, length: `quote-${index}`.length })))
        : positions.map(index => LocationStrategy.locate({ text: `quote-${index}`, textOffset: offsets[index] }));
      for (const [i, index] of positions.entries()) {
        const range = ranges[i];
        assert(range?.toString() === `quote-${index}`, 'Wrong restored quote');
        assert(range.startContainer === texts[index], 'Wrong duplicate occurrence');
      }
    });
    const highlights = positions.map(index => ({ highlightId: `fixture-${index}`, textContent: `quote-${index}`, textOffset: offsets[index] }));
    async function activate(useOffsets = true) {
      document.body.replaceChildren(fixture.cloneNode(true));
      const engine = new HighlightEngine();
      styleReads = 0;
      const start = performance.now();
      assert(await engine.activateHighlights(useOffsets ? highlights : highlights.map(({ textOffset: _offset, ...highlight }) => highlight)), 'Activation failed');
      const wallMs = performance.now() - start;
      assert(engine.getLastPerfStats()?.appliedCount === highlights.length, 'Activation lost highlights');
      assert(document.querySelectorAll('[data-clipsey-id]').length === highlights.length, 'Wrong rendered highlight count');
      assert(document.body.textContent === fullText, 'Painting changed original text');
      for (const highlight of highlights) {
        assert(document.querySelector(`[data-clipsey-id="${highlight.highlightId}"]`)?.textContent === highlight.textContent, 'Wrong painted quote');
      }
      return { wallMs, durationMs: engine.getLastPerfStats()!.durationMs, styleReads };
    }
    await activate();
    const samples = [];
    for (let i = 0; i < 7; i++) samples.push(await activate());
    const activation = {
      wallMedianMs: samples.map(sample => sample.wallMs).toSorted((a, b) => a - b)[3],
      durationMedianMs: samples.map(sample => sample.durationMs).toSorted((a, b) => a - b)[3],
      samples
    };
    await activate(false);
    const fallbackSamples = [];
    for (let i = 0; i < 7; i++) fallbackSamples.push(await activate(false));
    const fallbackActivation = {
      wallMedianMs: fallbackSamples.map(sample => sample.wallMs).toSorted((a, b) => a - b)[3],
      durationMedianMs: fallbackSamples.map(sample => sample.durationMs).toSorted((a, b) => a - b)[3],
      samples: fallbackSamples
    };
    results.push({ paragraphs: texts.length, fragmented, captures, restore, textSearch, activation, fallbackActivation });
  }
  const hiddenResults = [];
  for (const hiddenParagraphs of reverse ? [10000, 100] : [100, 10000]) {
    const hidden = '<div id="hidden" style="display:none">' + Array.from({ length: hiddenParagraphs }, (_, i) => `<p>hidden prefix ${i} <b>hidden-quote-${i}</b> tail</p>`).join('') + '</div>';
    document.body.innerHTML = hidden + '<p>before <b id="visible">visible-target</b> after</p>';
    const target = document.querySelector('#visible')!.firstChild!;
    if (allocations) addAllocationCase({ hiddenParagraphs }, 'hidden-subtree-search', document.body.innerHTML, 'visible-target');
    const probe = createTextNodeWalker(document.body, true)!;
    const filter = probe.filter as { acceptNode(node: Node): number };
    const accept = filter.acceptNode;
    let filterCalls = 0, textFilterCalls = 0;
    filter.acceptNode = node => { filterCalls++; if (node.nodeType === Node.TEXT_NODE) textFilterCalls++; return accept(node); };
    const visible = [];
    let current;
    while ((current = probe.nextNode())) visible.push(current.textContent);
    assert(visible.join('') === 'before visible-target after', 'Wrong visible traversal');
    const search = measure(() => {
      const range = findTextRangeInNode(document.body, 'visible-target');
      assert(range?.startContainer === target && range.toString() === 'visible-target', 'Wrong visible target after hidden content');
    });
    const missing = measure(() => { assert(findTextRangeInNode(document.body, 'missing-target') === null, 'Unexpected match'); });
    const range = document.createRange();
    range.selectNodeContents(target);
    const metadata = captureHighlightMetadata(range, null, 'visible');
    hiddenResults.push({ hiddenParagraphs, search, missing, textOffset: metadata?.textOffset, expectedVisibleOffset: 7, filterCalls, textFilterCalls });
  }
  const emptyResults = [];
  for (const emptyContainers of reverse ? [10000, 100] : [100, 10000]) {
    document.body.innerHTML = '<nav>' + '<a><img></a>'.repeat(emptyContainers) + '</nav><p>before <b id="visible">visible-target</b> after</p>';
    const target = document.querySelector('#visible')!.firstChild!;
    if (allocations) addAllocationCase({ emptyContainers }, 'empty-container-search', document.body.innerHTML, 'visible-target');
    const search = measure(() => {
      const range = findTextRangeInNode(document.body, 'visible-target');
      assert(range?.startContainer === target && range.toString() === 'visible-target', 'Wrong match after empty containers');
    });
    emptyResults.push({ emptyContainers, search });
  }
  window.getComputedStyle = readStyle;
  (window as any).__highlightAllocationCases = allocationCases;
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'highlights', reverse, results, hiddenResults, emptyResults };
} catch (error) {
  (window as any).__performanceResult = { error: String(error) };
}
