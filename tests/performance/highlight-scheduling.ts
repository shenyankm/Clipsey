// 真实 DOM；设置消息用空响应替代，生产定位、绘制与默认等待均保留。
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3];
try {
  (globalThis as any).chrome = {
    runtime: { sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ success: false }); return Promise.resolve({ success: false });
    } },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {}, removeListener() {} } }
  };
  const query = new URLSearchParams(location.search);
  const timerYield = query.has('timer-yield');
  if (timerYield) Object.defineProperty(globalThis, 'scheduler', { value: undefined, configurable: true });
  const { HighlightEngine } = await import('../../src/content/highlight-engine');
  const scenarios = [
    { paragraphs: 100, count: 20, offsets: true },
    { paragraphs: 100, count: 100, offsets: true },
    { paragraphs: 10000, count: 20, offsets: true },
    { paragraphs: 10000, count: 20, offsets: false },
    { paragraphs: 10000, count: 100, offsets: true },
    { paragraphs: 10000, count: 1000, offsets: true }
  ];
  if (query.has('reverse')) scenarios.reverse();
  const results = [];
  for (const scenario of scenarios) {
    const fixture = document.createElement('article');
    const offsets: number[] = [];
    let length = 0;
    for (let i = 0; i < scenario.paragraphs; i++) {
      const p = document.createElement('p');
      const prefix = `Paragraph ${i} prefix `;
      const strong = document.createElement('strong'); strong.id = `q-${i}`; strong.textContent = `quote-${i}`;
      p.append(prefix, strong, ' tail text '); offsets.push(length + prefix.length); length += p.textContent!.length;
      fixture.append(p);
    }
    const original = fixture.textContent;
    const positions = Array.from({ length: scenario.count }, (_, i) => Math.floor(i * scenario.paragraphs / scenario.count));
    if (query.has('reverse')) positions.reverse();
    const highlights = positions.map(i => ({ highlightId: `fixture-${i}`, textContent: `quote-${i}`, ...(scenario.offsets ? { textOffset: offsets[i] } : {}) }));
    async function activate() {
      document.body.replaceChildren(fixture.cloneNode(true));
      // 夹具构造后的初次布局不计入恢复；两帧后再启动响应性采样。
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const engine = new HighlightEngine();
      const longTasks: number[] = [];
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)));
      observer.observe({ type: 'longtask' });
      let heartbeatCount = 0, frameCount = 0, maxTimerGapMs = 0, maxFrameGapMs = 0;
      const start = performance.now(); let lastTimer = start, lastFrame = start;
      const heartbeat = setInterval(() => { const now = performance.now(); maxTimerGapMs = Math.max(maxTimerGapMs, now - lastTimer); lastTimer = now; heartbeatCount++; }, 16);
      let frame = requestAnimationFrame(function tick(now) { maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame); lastFrame = now; frameCount++; frame = requestAnimationFrame(tick); });
      let wallMs: number;
      try { assert(await engine.activateHighlights(highlights), 'Activation failed'); wallMs = performance.now() - start; }
      finally {
        clearInterval(heartbeat); cancelAnimationFrame(frame);
        longTasks.push(...observer.takeRecords().map(e => e.duration)); observer.disconnect();
        maxTimerGapMs = Math.max(maxTimerGapMs, performance.now() - lastTimer);
        maxFrameGapMs = Math.max(maxFrameGapMs, performance.now() - lastFrame);
      }
      assert(engine.getLastPerfStats()?.appliedCount === highlights.length, 'Lost highlights');
      assert(document.querySelectorAll('[data-clipsey-id]').length === highlights.length, 'Wrong paint count');
      assert(document.body.textContent === original, 'Changed original text');
      for (const i of positions) assert(document.querySelector(`#q-${i} [data-clipsey-id="fixture-${i}"]`)?.textContent === `quote-${i}`, 'Wrong target painted');
      engine.clear();
      assert(!document.querySelector('[data-clipsey-id]') && document.body.textContent === original, 'Clear changed original text');
      return { wallMs, durationMs: engine.getLastPerfStats()!.durationMs, heartbeatCount, frameCount, maxTimerGapMs, maxFrameGapMs, longTasks };
    }
    await activate();
    const samples = [];
    for (let i = 0; i < 7; i++) samples.push(await activate());
    results.push({ ...scenario, wallMedianMs: median(samples.map(s => s.wallMs)), durationMedianMs: median(samples.map(s => s.durationMs)), timerGapMedianMs: median(samples.map(s => s.maxTimerGapMs)), frameGapMedianMs: median(samples.map(s => s.maxFrameGapMs)), samples });
  }
  // 首项绘制后，在普通定时器任务中取消；不能仅证明微任务可执行。
  document.body.innerHTML = '<p>' + Array.from({ length: 1000 }, (_, i) => `item-${i}! `).join('') + '</p>';
  const engine = new HighlightEngine();
  const highlights = Array.from({ length: 1000 }, (_, i) => ({ textContent: `item-${i}!`, highlightId: `cancel-${i}` }));
  let firstPaintAt = 0, cancelledAt = 0, countAtCancel = 0;
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-clipsey-id]')) {
      observer.disconnect(); firstPaintAt = performance.now();
      setTimeout(() => { cancelledAt = performance.now(); countAtCancel = document.querySelectorAll('[data-clipsey-id]').length; engine.abort(); }, 0);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true });
  const activationResult = await engine.activateHighlights(highlights);
  await new Promise(resolve => setTimeout(resolve, 0));
  const finalCount = document.querySelectorAll('[data-clipsey-id]').length;
  assert(firstPaintAt > 0 && cancelledAt > 0, 'Cancellation never ran');
  const cancellation = { activationResult, countAtCancel, finalCount, latencyMs: cancelledAt - firstPaintAt, passed: activationResult === false && countAtCancel < 1000 && finalCount === countAtCancel };
  engine.clear();
  (window as any).__performanceResult = { userAgent: navigator.userAgent, scenario: 'highlight-scheduling', fixtureSettledFrames: 2, reverse: query.has('reverse'), timerYield, schedulerYieldSupported: typeof globalThis.scheduler?.yield === 'function', schedulerPostTaskSupported: typeof globalThis.scheduler?.postTask === 'function', results, cancellation };
} catch (error) { (window as any).__performanceResult = { error: String(error) }; }
