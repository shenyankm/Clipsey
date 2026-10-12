// 临时扩展配置、合成摘录与实际管理页；不访问用户数据。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const firefox = process.argv.includes('--firefox');
const root = resolve(process.env.EXTENSION_PATH ?? (firefox ? '.output/firefox-mv2' : '.output/chrome-mv3'));
const profile = await mkdtemp(join(tmpdir(), 'clipsey-search-profile-'));
const artifacts = await mkdtemp(join(tmpdir(), 'clipsey-search-acceptance-'));
const passed = [], errors = [];
let context, driver, session, log = '', capabilities, evaluate, backgroundEvaluate, waitFor, reload, command;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = name => { passed.push(name); console.log('PASS', name); };
try {
  if (firefox) {
    assert(process.env.FIREFOX_PATH && process.env.GECKODRIVER_PATH, 'Set FIREFOX_PATH and GECKODRIVER_PATH');
    assert.equal(JSON.parse(await readFile(join(root, 'manifest.json'))).manifest_version, 2);
    const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    driver = spawn(process.env.GECKODRIVER_PATH, ['--host', '127.0.0.1', '--port', String(port), '--profile-root', profile, '--allow-system-access'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let startupError;
    driver.on('error', error => { startupError = error; });
    driver.stdout.on('data', value => { log += value; }); driver.stderr.on('data', value => { log += value; });
    const request = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(50000) });
      const reply = await response.json(); if (!response.ok || reply.value?.error) throw new Error(JSON.stringify(reply)); return reply.value;
    };
    for (let i = 0; i < 100; i++) {
      try { await request('/status'); break; } catch {
        if (startupError) throw startupError;
        if (driver.exitCode !== null || i === 99) throw new Error(log || 'Driver startup failed');
        await pause(100);
      }
    }
    const started = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { binary: process.env.FIREFOX_PATH, args: ['-headless'] } } } });
    session = started.sessionId; capabilities = started.capabilities;
    command = (path, body, method) => request(`/session/${session}${path}`, body, method);
    await command('/timeouts', { script: 40000, pageLoad: 40000, implicit: 0 });
    const addon = await command('/moz/addon/install', { path: root, temporary: true });
    await command('/moz/context', { context: 'chrome' });
    const uuid = await command('/execute/sync', { script: 'return JSON.parse(Services.prefs.getCharPref("extensions.webextensions.uuids"))[arguments[0]]', args: [addon] }); assert(uuid);
    await command('/moz/context', { context: 'content' });
    reload = () => command('/url', { url: `moz-extension://${uuid}/options.html?tab=content` });
    evaluate = async (fn, arg) => {
      const reply = await command('/execute/async', { script: `const done=arguments[1];Promise.resolve().then(()=>(${fn.toString()})(arguments[0])).then(value=>done({value}),error=>done({scriptError:String(error)+"\\n"+error.stack}));`, args: [arg ?? null] });
      if (reply.scriptError) throw new Error(reply.scriptError); return reply.value;
    };
    backgroundEvaluate = async fn => {
      const reply = await command('/execute/async', { script: `const done=arguments[0];Promise.resolve().then(()=>(${fn.toString()})(browser.extension.getBackgroundPage())).then(value=>done({value}),error=>done({scriptError:String(error)+"\\n"+error.stack}));`, args: [] });
      if (reply.scriptError) throw new Error(reply.scriptError); return reply.value;
    };
    waitFor = async (fn, arg) => {
      for (let i = 0; i < 200; i++) { if (await evaluate(fn, arg)) return; await pause(100); }
      throw new Error(`UI timeout: ${fn}`);
    };
  } else {
    assert(process.env.CHROME_PATH, 'Set CHROME_PATH to Chrome for Testing');
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
    context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_PATH, headless: true, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    backgroundEvaluate = fn => worker.evaluate(fn);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const url = `chrome-extension://${new URL(worker.url()).hostname}/options.html?tab=content`;
    reload = () => page.goto(url); evaluate = (fn, arg) => page.evaluate(fn, arg);
    waitFor = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 20000 });
    capabilities = { browserVersion: context.browser().version() };
  }
  await reload();
  const ready = () => !!document.querySelector('.clip-toolbar__search input');
  await waitFor(ready);
  const send = message => evaluate(message => (globalThis.browser ?? chrome).runtime.sendMessage(message), message);
  const input = query => evaluate(query => {
    const element = document.querySelector('.clip-toolbar__search input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, query);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  const check = async (query, total, ids) => {
    await evaluate(() => { window.__searchProbe.scans = 0; window.__searchProbe.revisions = 0; });
    await input(query);
    await waitFor(({ total, ids }) => window.__searchProbe.revisions > 0 &&
      document.querySelector('.clip-toolbar__stat-value')?.textContent.trim() === String(total) &&
      !document.querySelector('.ant-spin-spinning') &&
      JSON.stringify([...document.querySelectorAll('tbody tr[data-row-key]')].map(row => row.dataset.rowKey)) === JSON.stringify(ids), { total, ids });
    return evaluate(() => window.__searchProbe);
  };
  for (const records of [100, 10000]) {
    const clips = Array.from({ length: records }, (_, i) => ({
      id: `cache-${String(i).padStart(5, '0')}`, title: i % 7 ? `Title ${i % 100}` : undefined,
      textContent: i % 2 ? `cache needle ${i}` : `other ${i}`,
      htmlContent: `<p><b>rich ${i}</b></p>`, sourceUrl: 'https://example.com/native-search',
      createdAt: new Date(1700000000000 + i * 1000).toISOString(), updatedAt: '2025-02-01T00:00:00.000Z'
    }));
    assert.equal((await send({ type: 'IMPORT_DATA', payload: { clips } })).success, true);
    await reload(); await waitFor(ready);
    await waitFor(records => document.querySelector('.clip-toolbar__stat-value')?.textContent.trim() === String(records), records);
    await evaluate(() => {
      window.__searchProbe = { scans: 0, revisions: 0, keyCursors: 0, lookups: 0 };
      const getAll = IDBObjectStore.prototype.getAll, get = IDBObjectStore.prototype.get, keyCursor = IDBIndex.prototype.openKeyCursor;
      IDBObjectStore.prototype.getAll = function(...args) { if (this.name === 'clips') window.__searchProbe.scans++; return getAll.apply(this, args); };
      IDBObjectStore.prototype.get = function(key) { if (this.name === 'clips') window.__searchProbe.lookups++; if (this.name === 'metadata' && key === '__clipseyClipRevision') window.__searchProbe.revisions++; return get.call(this, key); };
      IDBIndex.prototype.openKeyCursor = function(...args) { if (this.objectStore.name === 'clips') window.__searchProbe.keyCursors++; return keyCursor.apply(this, args); };
    });
    if (records === 10000) {
      const last = clips.slice(0, 20).toReversed().map(clip => clip.id);
      await evaluate(() => document.querySelector('.ant-pagination-item-500').click());
      await waitFor(ids => !document.querySelector('.ant-spin-spinning') &&
        JSON.stringify([...document.querySelectorAll('tbody tr[data-row-key]')].map(row => row.dataset.rowKey)) === JSON.stringify(ids), last);
      const probe = await evaluate(() => window.__searchProbe);
      assert.equal(probe.keyCursors, 1); assert.equal(probe.lookups, 20); assert.equal(probe.scans, 0);
      assert.equal(await evaluate(() => document.querySelector('.clip-toolbar__stat-value').textContent.trim()), '10000');
      record('10000: actual ordinary page 500 uses a key cursor and hydrates only its 20 rows');
      await evaluate(() => document.querySelector('tbody tr[data-row-key] button').click());
      await waitFor(() => document.querySelector('.ant-modal-body b')?.textContent === 'rich 19');
      await evaluate(() => document.querySelector('.ant-modal-close').click());
      record('10000: deep ordinary page retains rich content in the actual detail dialog');
      await evaluate(() => document.querySelector('.ant-pagination-item-1').click());
      await waitFor(ids => JSON.stringify([...document.querySelectorAll('tbody tr[data-row-key]')].map(row => row.dataset.rowKey)) === JSON.stringify(ids), clips.toReversed().slice(0, 20).map(clip => clip.id));
    }
    const matches = clips.filter(clip => clip.textContent.includes('needle'));
    const ids = matches.toReversed().slice(0, 20).map(clip => clip.id);
    assert.equal((await check('@content cache needle', matches.length, ids)).scans, Math.ceil(records / 256));
    record(`${records}: cold actual UI search returns the expected full page and total`);
    assert.equal((await check('@content CACHE NEEDLE', matches.length, ids)).scans, 0);
    record(`${records}: warm UI search checks revision and avoids repeated full-record scans`);
    await evaluate(() => document.querySelector('tbody tr[data-row-key] button').click());
    await waitFor(text => document.querySelector('.ant-modal-body b')?.textContent === text, `rich ${records - 1}`);
    await evaluate(() => document.querySelector('.ant-modal-close').click());
    record(`${records}: warm search hydrates rich content in the actual detail dialog`);
    if (records === 10000) {
      await evaluate(() => { window.__searchProbe.scans = 0; document.querySelector('thead th').click(); });
      const sorted = [...matches].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '') || a.id.localeCompare(b.id)).slice(0, 20).map(clip => clip.id);
      await waitFor(ids => JSON.stringify([...document.querySelectorAll('tbody tr[data-row-key]')].map(row => row.dataset.rowKey)) === JSON.stringify(ids), sorted);
      assert.equal((await evaluate(() => window.__searchProbe)).scans, 0);
      record('10000: title sorting reuses the snapshot, including missing titles and stable ties');
    }
    const backup = await send({ type: 'EXPORT_DATA' }); assert.equal(backup.success, true);
    assert.equal(backup.data.clips.length, records);
    const storedById = new Map(backup.data.clips.map(clip => [clip.id, clip]));
    for (const original of clips) {
      const stored = storedById.get(original.id); assert(stored);
      assert.equal(stored.htmlContent, original.htmlContent); assert(!('__clipseyUrlKey' in stored));
    }
    record(`${records}: backup preserves rich content and omits private index fields`);
  }
  const payload = { textContent: 'cache fresh', htmlContent: '<b>cache fresh</b>', sourceUrl: 'https://example.com/native-search', title: 'Saved' };
  assert.equal((await send({ type: 'SAVE_CLIP', payload })).success, true);
  const fresh = (await send({ type: 'EXPORT_DATA' })).data.clips.find(clip => clip.textContent === 'cache fresh'); assert(fresh);
  await check('@content cache fresh', 1, [fresh.id]); record('background single-record save is visible in the options search');
  assert.equal((await send({ type: 'DELETE_CLIP', payload: { id: fresh.id } })).success, true);
  await check('@content CACHE FRESH', 0, []); record('background delete invalidates the search snapshot');
  assert.equal((await send({ type: 'CLEAR_CLIPS' })).success, true);
  await check('@content needle', 0, []); record('background clear leaves no cached matches');
  const quotaClip = { id: 'quota', textContent: 'quota needle', htmlContent: '<b>Quota</b>', sourceUrl: 'https://example.com/native-search', createdAt: '2025-01-01T00:00:00.000Z' };
  assert.equal((await send({ type: 'IMPORT_DATA', payload: { clips: [quotaClip] } })).success, true);
  await check('@content quota needle', 1, ['quota']);
  assert.equal((await check('@content QUOTA NEEDLE', 1, ['quota'])).scans, 0);
  await backgroundEvaluate((scope = globalThis) => {
    const put = scope.IDBObjectStore.prototype.put, add = scope.IDBObjectStore.prototype.add;
    scope.__quotaRestore = () => { scope.IDBObjectStore.prototype.put = put; };
    scope.__quotaErrorSeen = false;
    scope.IDBObjectStore.prototype.put = function(value, key) {
      if (this.name !== 'metadata' || value.key !== '__clipseyClipRevision') return put.call(this, value, key);
      // 触发真实请求错误和默认回滚，仅替换错误身份；不填满磁盘。
      const request = add.call(this, value, key);
      Object.defineProperty(request, 'error', { get: () => new scope.DOMException('Quota full', 'QuotaExceededError') });
      request.addEventListener('error', () => { scope.__quotaErrorSeen = true; });
      return request;
    };
  });
  await evaluate(() => document.querySelector('tbody tr[data-row-key] .ant-btn-dangerous').click());
  await waitFor(() => !!document.querySelector('.ant-popover .ant-btn-primary'));
  await evaluate(() => document.querySelector('.ant-popover .ant-btn-primary').click());
  await waitFor(() => document.querySelector('.clip-toolbar__stat-value')?.textContent.trim() === '0');
  assert.equal(await backgroundEvaluate((scope = globalThis) => scope.__quotaErrorSeen), true);
  await backgroundEvaluate((scope = globalThis) => scope.__quotaRestore());
  assert((await check('@content quota needle', 0, [])).scans > 0);
  const markerMissing = await evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('ClipseyDB'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, read = db.transaction('metadata').objectStore('metadata').get('__clipseyClipRevision');
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => { db.close(); resolve(read.result === undefined); };
    };
  }));
  assert.equal(markerMissing, true);
  record('native revision request error allows actual UI deletion and markerless fresh search');
  if (firefox) {
    await command('/moz/context', { context: 'chrome' });
    const scriptErrors = await command('/execute/sync', { script: 'return Services.console.getMessageArray().filter(m=>m.sourceName?.startsWith("moz-extension://")&&!(m.flags&1)).map(m=>({message:m.errorMessage,source:m.sourceName,line:m.lineNumber}))', args: [] });
    errors.push(...scriptErrors);
  }
  assert.deepEqual(errors, []); record('no extension page script errors');
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ capabilities, root, passed, errors }, null, 2));
  console.log('ARTIFACTS', artifacts);
} finally {
  await context?.close();
  if (session) try { await command('', undefined, 'DELETE'); } catch (error) { console.error('CLEANUP', error.message); }
  driver?.kill('SIGTERM');
  if (driver) await writeFile(join(artifacts, 'geckodriver.log'), log);
  await rm(profile, { recursive: true, force: true });
}
