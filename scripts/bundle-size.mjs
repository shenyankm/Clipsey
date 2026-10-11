// 统计生产页面及其静态 JS 依赖；不含 CSS、动态 import 或浏览器缓存收益。
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(process.argv[2] ?? '.output/chrome-mv3');
const result = {};
for (const page of ['popup.html', 'options.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  const files = new Map();
  async function visit(path) {
    path = resolve(path);
    if (files.has(path)) return;
    files.set(path, (await stat(path)).size);
    const source = await readFile(path, 'utf8');
    for (const [, dependency] of source.matchAll(/(?:from|import)\s*["'](\.[^"']+\.js)["']/g)) {
      await visit(resolve(dirname(path), dependency));
    }
  }
  for (const [, source] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    await visit(resolve(root, source.replace(/^\//, '')));
  }
  assert(files.size > 0, `No scripts found for ${page}`);
  result[page] = {
    bytes: [...files.values()].reduce((a, b) => a + b, 0),
    files: Object.fromEntries([...files].map(([path, size]) => [basename(path), size]))
  };
}
console.log(JSON.stringify(result, null, 2));
