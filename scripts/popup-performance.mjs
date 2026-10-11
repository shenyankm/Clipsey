// 独立临时 Chrome 扩展与合成数据；不访问已安装扩展或用户摘录。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
assert(process.env.CHROME_PATH, 'Set CHROME_PATH to an extension-capable Chrome for Testing executable');
const root = resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3');
const profile = await mkdtemp(join(tmpdir(), 'clipsey-popup-'));
let context;
try {
    context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_PATH, headless: true, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
    const errors = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    // 服务工作线程单独取样；渲染进程的 heap 指标不能替代后台内存。
    const browserCdp = await context.browser().newBrowserCDPSession();
    const { targetInfos } = await browserCdp.send('Target.getTargets');
    const target = targetInfos.find(t => t.type === 'service_worker' && t.url.includes(extensionId));
    assert(target, 'Extension service worker not found');
    const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    let seq = 0;
    const pending = new Map();
    browserCdp.on('Target.receivedMessageFromTarget', event => {
        if (event.sessionId !== sessionId)
            return;
        const reply = JSON.parse(event.message), request = pending.get(reply.id);
        if (!request)
            return;
        pending.delete(reply.id);
        clearTimeout(request.timer);
        reply.error ? request.reject(new Error(JSON.stringify(reply.error))) : request.resolve(reply.result);
    });
    const sendWorker = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
        pending.set(id, { resolve, reject, timer });
        browserCdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
            .catch(error => { clearTimeout(timer); pending.delete(id); reject(error); });
    });
    const workerSnapshot = async () => {
        const before = await sendWorker('Runtime.getHeapUsage');
        await sendWorker('HeapProfiler.collectGarbage');
        return { before, after: await sendWorker('Runtime.getHeapUsage') };
    };
    const seed = await context.newPage();
    await seed.goto(`chrome-extension://${extensionId}/options.html`);
    await seed.evaluate(() => chrome.storage.local.set({ 'clipsey-options': { language: 'zh-CN', autoHighlightPageSummary: false, autoLocateFirstSummary: false } }));
    const fixture = await context.newPage();
    await fixture.route('https://example.com/article', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><p>popup benchmark fixture</p>' }));
    await fixture.goto('https://example.com/article');
    const results = [];
    for (const size of [100, 10000]) {
        const clips = Array.from({ length: size }, (_, i) => ({ id: `clip-${i}`, textContent: `Entry ${i} ${'text '.repeat(128)}`, htmlContent: `<p>Entry ${i} <strong>${'text '.repeat(128)}</strong></p>`, sourceUrl: i < 45 ? 'https://example.com/article' : `https://example.com/other/${i}`, createdAt: new Date(1700000000000 + i * 1000).toISOString(), title: `Entry ${i}` }));
        const imported = await seed.evaluate(clips => chrome.runtime.sendMessage({ type: 'IMPORT_DATA', payload: { clips } }), clips);
        assert.equal(imported.success, true);
        const afterImport = await workerSnapshot();
        const samples = [];
        for (let i = 0; i < 8; i++) {
            const popup = await context.newPage();
            await popup.setViewportSize({ width: 450, height: 640 });
            const session = await context.newCDPSession(popup);
            await session.send('Performance.enable');
            await popup.addInitScript(() => {
                window.__boot = { requests: [], longTasks: [], emptyBeforeList: false };
                const boot = window.__boot;
                new PerformanceObserver(list => { for (const e of list.getEntries())
                    boot.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
                const send = chrome.runtime.sendMessage.bind(chrome.runtime);
                chrome.runtime.sendMessage = function (...args) {
                    const type = args[0]?.type, start = performance.now();
                    const callback = args.findIndex(x => typeof x === 'function');
                    if (callback !== -1) {
                        const original = args[callback];
                        args[callback] = (...reply) => { boot.requests.push({ type, start, end: performance.now() }); return original(...reply); };
                        return send(...args);
                    }
                    const result = send(...args);
                    if (result?.then)
                        return result.then(reply => { boot.requests.push({ type, start, end: performance.now() }); return reply; });
                    return result;
                };
                const observer = new MutationObserver(() => {
                    if (!boot.done && document.querySelector('.ant-empty'))
                        boot.emptyBeforeList = true;
                    if (boot.shell === undefined && document.querySelector('.popup-header'))
                        boot.shell = performance.now();
                    if (!boot.done && document.querySelectorAll('.summary-content').length === 20 && !document.querySelector('.ant-spin-spinning')) {
                        boot.list = performance.now();
                        boot.done = true;
                        requestAnimationFrame(() => requestAnimationFrame(() => { boot.ready = performance.now(); }));
                    }
                });
                observer.observe(document, { childList: true, subtree: true, attributes: true });
            });
            await fixture.bringToFront();
            if (process.env.PROFILE && size === 10000 && i === 1) {
                await session.send('Profiler.enable');
                await session.send('Profiler.start');
            }
            await popup.goto(`chrome-extension://${extensionId}/popup.html`);
            await popup.waitForFunction(() => window.__boot?.ready, undefined, { timeout: 10000 });
            assert.equal(await popup.locator('.popup-header__url').textContent(), 'example.com/article');
            assert.equal(await popup.locator('.summary-content').count(), 20);
            assert.equal(await popup.locator('.popup-header__title').evaluate(el => el.tagName), 'H5');
            assert.equal(await popup.locator('.summary-content strong').count(), 20);
            assert.match(await popup.locator('.summary-content').first().textContent(), /^Entry 44 /);
            const boot = await popup.evaluate(() => ({ ...window.__boot, domReady: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, resources: performance.getEntriesByType('resource').filter(x => x.initiatorType === 'script').map(x => ({ name: x.name, duration: x.duration, transferSize: x.transferSize })) }));
            const metrics = (await session.send('Performance.getMetrics')).metrics;
            const get = n => metrics.find(x => x.name === n)?.value;
            if (process.env.PROFILE && size === 10000 && i === 1) {
                const { profile } = await session.send('Profiler.stop');
                await writeFile(process.env.PROFILE, JSON.stringify(profile));
            }
            if (i > 0)
                samples.push({ ...boot, jsHeapUsed: get('JSHeapUsedSize'), jsHeapTotal: get('JSHeapTotalSize'), nodes: get('Nodes'), scriptDurationMs: get('ScriptDuration') * 1000, layoutDurationMs: get('LayoutDuration') * 1000 });
            await session.send('HeapProfiler.collectGarbage');
            const gcMetrics = (await session.send('Performance.getMetrics')).metrics;
            if (i > 0)
                samples[samples.length - 1].heapAfterGcBytes = gcMetrics.find(x => x.name === 'JSHeapUsedSize').value;
            await session.detach();
            await popup.close();
        }
        const afterPaged = await workerSnapshot();
        const all = await seed.evaluate(async () => { const r = await chrome.runtime.sendMessage({ type: 'REQUEST_CLIPS' }); return { success: r.success, count: r.data?.length }; });
        assert.equal(all.success, true);
        assert.equal(all.count, size);
        const afterAll = await workerSnapshot();
        assert.equal((await seed.evaluate(() => chrome.runtime.sendMessage({ type: 'DELETE_CLIP', payload: { id: 'clip-0' } }))).success, true);
        const afterInvalidation = await workerSnapshot();
        const median = key => samples.map(s => s[key]).sort((a, b) => a - b)[3];
        results.push({ size, medianMs: { shell: median('shell'), list: median('list'), ready: median('ready'), domReady: median('domReady'), script: median('scriptDurationMs'), layout: median('layoutDurationMs') }, heapMedianBytes: median('jsHeapUsed'), heapAfterGcMedianBytes: median('heapAfterGcBytes'), backgroundHeap: { afterImport, afterPaged, afterAll, afterInvalidation }, samples });
    }
    await browserCdp.send('Target.detachFromTarget', { sessionId });
    await browserCdp.detach();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: await context.browser().version(), extensionPath: root, results, errors }, null, 2));
}
finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
}
