// 真实 Chrome + IndexedDB；临时用户目录，不访问已安装扩展或用户摘录。
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const writes = process.argv.includes('--writes');
const search = process.argv.includes('--search');
const highlights = process.argv.includes('--highlights');
const baselineRef = baseline
  ? execFileSync('git', ['rev-parse', process.env.BASELINE_REF ?? 'HEAD'], { encoding: 'utf8' }).trim()
  : undefined;
const legacyUrlLookup = baseline && !writes && !search && !highlights && !/async getByUrl\(/.test(
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
      const files = writes
        ? ['src/background/storage.ts', 'src/background/storage/sync-manager.ts']
        : search ? ['src/background/services/search-service.ts', 'src/background/indexeddb-query.ts']
        : highlights ? ['src/content/highlight/dom-utils.ts', 'src/content/highlight/metadata.ts', 'src/content/highlight/locators/offset-locator.ts', 'src/content/highlight-engine.ts']
        : ['src/background/storage/cache-manager.ts', 'src/background/indexeddb-query.ts'];
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
        if (req.url !== '/') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><script type="module" src="/tests/performance/${writes ? 'writes' : search ? 'search' : highlights ? 'highlights' : 'browser'}.ts"></script>`);
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
  const deadline = Date.now() + 120000;
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
  await send('Page.navigate', { url: server.resolvedUrls.local[0] });
  let result;
  while (!result) {
    if (Date.now() > deadline) throw new Error('Performance run timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
    const response = await send('Runtime.evaluate', { expression: 'window.__performanceResult', returnByValue: true });
    result = response.result.value;
  }
  if (result.error) throw new Error(result.error);
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'working-tree', baselineRef: baseline ? baselineRef : undefined, ...result }, null, 2));
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
