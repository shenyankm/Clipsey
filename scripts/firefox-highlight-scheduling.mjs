// 独立临时 Firefox + 真实 DOM；复用 Chrome 的调度夹具，不访问用户扩展或摘录。
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as createSocketServer } from 'node:net';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

assert(process.env.FIREFOX_PATH, 'Set FIREFOX_PATH to a Firefox executable');
assert(process.env.GECKODRIVER_PATH, 'Set GECKODRIVER_PATH to a geckodriver executable');
const baseline = process.argv.includes('--baseline');
const paginationKeys = process.argv.includes('--pagination-keys');
const paginationCount = process.argv.includes('--pagination-count');
const countTransition = process.argv.includes('--count-transition');
const pageKeys = process.argv.includes('--page-keys');
const paginationOnePass = process.argv.includes('--pagination-one-pass');
const pagination = paginationKeys || paginationCount || countTransition || pageKeys || paginationOnePass;
const baselineRef = baseline ? execFileSync('git', ['rev-parse', process.env.BASELINE_REF ?? 'HEAD'], { encoding: 'utf8' }).trim() : undefined;
const files = pagination
  ? ['src/background/indexeddb.ts', 'src/background/indexeddb-query.ts', 'src/types/indexeddb.ts', 'src/background/storage/utils/clip-url-record.ts']
  : ['src/content/highlight/dom-utils.ts', 'src/content/highlight/metadata.ts', 'src/content/highlight/locators/offset-locator.ts', 'src/content/highlight/text-search.ts', 'src/content/highlight-engine.ts'];
const server = await createServer({
  configFile: false, logLevel: 'silent', resolve: { alias: { '@': resolve('src') } },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'firefox-highlight-scheduling',
    load(id) {
      const path = id.split('?')[0];
      if (baseline && files.some(file => path === resolve(file))) return execFileSync('git', ['show', `${baselineRef}:${path.slice(resolve('.').length + 1)}`], { encoding: 'utf8' });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><script type="module" src="/tests/performance/${paginationOnePass ? 'pagination-one-pass' : pageKeys ? 'page-keys' : countTransition ? 'count-transition' : paginationCount ? 'pagination-count' : paginationKeys ? 'pagination-keys' : 'highlight-scheduling'}.ts"></script>`);
      });
    }
  }]
});
const profileRoot = await mkdtemp(join(tmpdir(), 'clipsey-firefox-scheduling-profile-'));
const socket = createSocketServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
let driver, session, log = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const reply = await response.json();
  assert(response.ok && !reply.value?.error, JSON.stringify(reply));
  return reply.value;
}
const command = (path, body, method) => request(`/session/${session}${path}`, body, method);
try {
  await server.listen();
  driver = spawn(process.env.GECKODRIVER_PATH, ['--host', '127.0.0.1', '--port', String(port), '--profile-root', profileRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  let launchError;
  driver.on('error', error => { launchError = error; });
  driver.stdout.on('data', data => { log += data; });
  driver.stderr.on('data', data => { log += data; });
  for (let i = 0; i < 100; i++) {
    try { await request('/status'); break; }
    catch { if (launchError) throw launchError; assert.equal(driver.exitCode, null, log); assert(i < 99, 'Driver startup timed out'); await pause(100); }
  }
  const started = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { binary: process.env.FIREFOX_PATH, args: ['-headless'] } } } });
  session = started.sessionId;
  await command('/timeouts', { pageLoad: 20000, script: 10000, implicit: 0 });
  const query = new URLSearchParams();
  if (process.argv.includes('--reverse')) query.set('reverse', '1');
  if (process.argv.includes('--timer-yield')) query.set('timer-yield', '1');
  await command('/url', { url: server.resolvedUrls.local[0] + (query.size ? `?${query}` : '') });
  const deadline = Date.now() + 180000;
  let result;
  while (!result) {
    assert(Date.now() < deadline, 'Firefox scheduling run timed out');
    await pause(250);
    result = await command('/execute/sync', { script: 'return window.__performanceResult || null', args: [] });
  }
  assert(!result.error, result.error);
  if (pagination) assert.equal(result.scenario, paginationOnePass ? 'pagination-one-pass' : pageKeys ? 'page-keys' : countTransition ? 'count-transition' : paginationCount ? 'pagination-count' : 'pagination-keys');
  else assert.equal(result.cancellation.passed, true, 'Cancellation failed');
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'working-tree', baselineRef, capabilities: started.capabilities, ...result }, null, 2));
} finally {
  if (session) try { await command('', undefined, 'DELETE'); } catch (error) { console.error('CLEANUP', error.message); }
  driver?.kill('SIGTERM');
  if (process.env.DRIVER_LOG) await writeFile(process.env.DRIVER_LOG, log);
  await server.close();
  await rm(profileRoot, { recursive: true, force: true });
}
