// 真实 Chrome + IndexedDB；临时用户目录，不访问已安装扩展或用户摘录。
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const writes = process.argv.includes('--writes');
const searchProjection = process.argv.includes('--search-projection');
const search = process.argv.includes('--search') || searchProjection;
const highlightScheduling = process.argv.includes('--highlight-scheduling');
const textMapping = process.argv.includes('--text-mapping');
const highlights = process.argv.includes('--highlights') || highlightScheduling || textMapping;
const cache = process.argv.includes('--cache');
const index = process.argv.includes('--index');
const normalize = process.argv.includes('--normalize');
const urlRead = process.argv.includes('--url-read');
const pageCache = process.argv.includes('--page-cache');
const writeLayout = process.argv.includes('--write-layout');
const keyLayout = process.argv.includes('--key-layout');
const paginationKeys = process.argv.includes('--pagination-keys');
const paginationCount = process.argv.includes('--pagination-count');
const countTransition = process.argv.includes('--count-transition');
const pagination = paginationKeys || paginationCount || countTransition;
const allocations = process.argv.includes('--allocations');
if (process.env.PROFILE && allocations) throw new Error('Run CPU profiling separately from allocation sampling');
if (allocations && !cache && !index && !normalize && !urlRead && !pageCache && !keyLayout && !highlights && (!search || searchProjection)) throw new Error('--allocations requires a cache, search or highlight benchmark');
if (urlRead && baseline) throw new Error('--url-read compares the current cache path and experimental strategies in one run');
if (searchProjection && baseline) throw new Error('--search-projection compares the current query path and experimental store in one run');
const baselineRef = baseline
  ? execFileSync('git', ['rev-parse', process.env.BASELINE_REF ?? 'HEAD'], { encoding: 'utf8' }).trim()
  : undefined;
const legacyUrlLookup = baseline && !writes && !search && !highlights && !cache && !index && !normalize && !/async getByUrl\(/.test(
  execFileSync('git', ['show', `${baselineRef}:src/background/storage/cache-manager.ts`], { encoding: 'utf8' })
);
const profile = await mkdtemp(join(tmpdir(), 'clipsey-perf-'));
const server = await createServer({
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': resolve('src') } },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'performance-page',
    load(id) {
      if (!baseline) return;
      const path = id.split('?')[0];
      const databaseFiles = ['src/background/indexeddb.ts', 'src/background/indexeddb-query.ts', 'src/types/indexeddb.ts', 'src/background/storage/utils/clip-url-record.ts'];
      const cacheFiles = ['src/background/storage.ts', 'src/background/storage/cache-manager.ts', 'src/background/storage/clip-index.ts', 'src/background/storage/utils/clip-normalizer.ts'];
      const files = pagination ? databaseFiles : pageCache || writeLayout || keyLayout ? [...cacheFiles, ...databaseFiles] : writes
        ? ['src/background/storage.ts', 'src/background/storage/sync-manager.ts', 'src/background/storage/utils/clip-normalizer.ts', ...databaseFiles]
        : normalize ? ['src/background/storage/utils/clip-normalizer.ts']
        : index ? ['src/background/storage/clip-index.ts']
        : cache ? [...cacheFiles, ...databaseFiles]
        : search ? ['src/background/services/search-service.ts', ...databaseFiles]
        : highlights ? ['src/content/highlight/dom-utils.ts', 'src/content/highlight/metadata.ts', 'src/content/highlight/locators/offset-locator.ts', 'src/content/highlight/text-search.ts', 'src/content/highlight-engine.ts']
        : ['src/background/storage/cache-manager.ts', 'src/background/indexeddb-query.ts', 'src/background/storage/clip-index.ts', 'src/background/storage/utils/clip-normalizer.ts'];
      if (files.some(file => path === resolve(file))) {
        return execFileSync('git', ['show', `${baselineRef}:${path.slice(resolve('.').length + 1)}`], { encoding: 'utf8' });
      }
      if (legacyUrlLookup && path === resolve('tests/performance/browser.ts')) {
        return readFile(path, 'utf8').then(source => source.replace(
          "const matches = await cache.getByUrl('https://example.com/article/0', loader);",
          "await cache.get(loader); const matches = cache.getByUrl('https://example.com/article/0');"
        ));
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><script type="module" src="/tests/performance/${countTransition ? 'count-transition' : paginationCount ? 'pagination-count' : paginationKeys ? 'pagination-keys' : keyLayout ? 'key-layout' : writeLayout ? 'write-layout' : pageCache ? 'page-cache' : writes ? 'writes' : urlRead ? 'url-read' : normalize ? 'normalize' : index ? 'index' : cache ? 'cache' : searchProjection ? 'search-projection' : search ? 'search' : textMapping ? 'text-mapping' : highlightScheduling ? 'highlight-scheduling' : highlights ? 'highlights' : 'browser'}.ts"></script>`);
      });
    }
  }]
});
let chrome;
let socket;
try {
  await server.listen();
  chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'
  ], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  const deadline = Date.now() + (pagination ? 180000 : 120000);
  let port;
  while (!port) {
    if (launchError) throw launchError;
    if (Date.now() > deadline) throw new Error('Chrome startup timed out');
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') console.error(JSON.stringify(message.params));
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`${method} timed out`));
    }, 10000);
    pending.set(requestId, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); }
    });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  await send('Runtime.enable');
  if (process.env.PROFILE) {
    await send('Profiler.enable');
    await send('Profiler.start');
  }
  const query = new URLSearchParams();
  if (allocations && (highlights || search)) query.set('allocations', '1');
  if (highlightScheduling && process.argv.includes('--timer-yield')) query.set('timer-yield', '1');
  if ((pagination || urlRead || pageCache || writeLayout || keyLayout || highlights || search) && process.argv.includes('--reverse')) query.set('reverse', '1');
  if (pageCache && process.argv.includes('--legacy-v4')) query.set('legacy-v4', '1');
  await send('Page.navigate', { url: server.resolvedUrls.local[0] + (query.size ? `?${query}` : '') });
  let result;
  while (!result) {
    if (Date.now() > deadline) throw new Error('Performance run timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
    const response = await send('Runtime.evaluate', { expression: 'window.__performanceResult', returnByValue: true });
    result = response.result.value;
  }
  if (result.error) throw new Error(result.error);
  if (process.env.PROFILE) {
    const { profile: cpuProfile } = await send('Profiler.stop');
    await writeFile(process.env.PROFILE, JSON.stringify(cpuProfile));
  }
  if (allocations) {
    const caseList = highlights ? '__highlightAllocationCases' : '__cacheAllocationCases';
    const describe = await send('Runtime.evaluate', {
      expression: `window.${caseList}.map(({ records, paragraphs, hiddenParagraphs, emptyContainers, name }) => ({ records, paragraphs, hiddenParagraphs, emptyContainers, name }))`, returnByValue: true
    });
    const cases = describe.result.value;
    if (!Array.isArray(cases)) throw new Error('Missing allocation cases');
    const evaluate = async expression => {
      const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    };
    const size = node => node.selfSize + node.children.reduce((sum, child) => sum + size(child), 0);
    result.allocationSamples = [];
    for (const [index, scenario] of cases.entries()) {
      const samplesBytes = [];
      const heapSamples = [];
      const allocationSites = new Map();
      for (let i = 0; i < 7; i++) {
        await evaluate(`window.${caseList}[${index}].prepare()`);
        await send('HeapProfiler.collectGarbage');
        const heapBefore = search ? await send('Runtime.getHeapUsage') : undefined;
        await send('HeapProfiler.startSampling', {
          samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true
        });
        await evaluate(`window.${caseList}[${index}].operation()`);
        const { profile } = await send('HeapProfiler.stopSampling');
        if (search) {
          await send('HeapProfiler.collectGarbage');
          heapSamples.push({ before: heapBefore, after: await send('Runtime.getHeapUsage') });
        }
        function collectSites(node) {
          const frame = node.callFrame;
          const key = JSON.stringify([frame.functionName, frame.url, frame.lineNumber, frame.columnNumber]);
          if (node.selfSize) {
            const site = allocationSites.get(key) ?? { ...frame, samplesBytes: Array(7).fill(0) };
            site.samplesBytes[i] += node.selfSize;
            allocationSites.set(key, site);
          }
          node.children.forEach(collectSites);
        }
        collectSites(profile.head);
        await evaluate(`window.${caseList}[${index}].verify?.()`);
        samplesBytes.push(size(profile.head));
      }
      const sites = [...allocationSites.values()].map(site => ({ ...site, medianBytes: site.samplesBytes.toSorted((a, b) => a - b)[3] }))
        .sort((a, b) => b.medianBytes - a.medianBytes);
      if (samplesBytes.some((bytes, index) => sites.reduce((sum, site) => sum + site.samplesBytes[index], 0) !== bytes)) throw new Error('Allocation site totals do not match sampled bytes');
      result.allocationSamples.push({ ...scenario, medianBytes: samplesBytes.toSorted((a, b) => a - b)[3], samplesBytes, sites, ...(search ? { heapSamples } : {}) });
    }
  }
  await send('Runtime.evaluate', { expression: 'window.__performanceCleanup?.()' });
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'working-tree', baselineRef: baseline ? baselineRef : undefined, cpuProfiled: Boolean(process.env.PROFILE), ...result }, null, 2));
} finally {
  socket?.close();
  if (chrome?.pid && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await exited;
  }
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
