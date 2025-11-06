/**
 * 图标验证脚本
 * 用于检查扩展的所有图标是否正确配置和加载
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(path, description) {
  const fullPath = resolve(rootDir, path);
  const exists = existsSync(fullPath);
  
  if (exists) {
    const stats = statSync(fullPath);
    log(`✓ ${description}: ${path} (${stats.size} bytes)`, 'green');
    return true;
  } else {
    log(`✗ ${description}: ${path} - 文件不存在`, 'red');
    return false;
  }
}

function checkManifest() {
  log('\n=== 检查 Manifest 配置 ===', 'cyan');
  
  // 检查源 manifest
  const srcManifestPath = resolve(rootDir, 'manifest.json');
  if (!existsSync(srcManifestPath)) {
    log('✗ manifest.json 不存在', 'red');
    return false;
  }
  
  const srcManifest = JSON.parse(readFileSync(srcManifestPath, 'utf-8'));
  log('\n源 manifest.json 配置:', 'blue');
  log(`  action.default_icon: ${JSON.stringify(srcManifest.action?.default_icon)}`);
  log(`  icons: ${JSON.stringify(srcManifest.icons)}`);
  
  // 检查构建后的 manifest
  const distManifestPath = resolve(rootDir, 'dist/manifest.json');
  if (!existsSync(distManifestPath)) {
    log('\n⚠ dist/manifest.json 不存在，跳过构建产物检查', 'yellow');
    return true;
  }
  
  const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf-8'));
  let allOk = true;
  
  // 检查 action.default_icon
  if (distManifest.action?.default_icon) {
    log('\n检查构建后的 action.default_icon:', 'blue');
    for (const [size, path] of Object.entries(distManifest.action.default_icon)) {
      if (!checkFile(`dist/${path}`, `  工具栏图标 ${size}x${size}`)) {
        allOk = false;
      }
    }
  }
  
  // 检查 icons
  if (distManifest.icons) {
    log('\n检查构建后的全局 icons:', 'blue');
    for (const [size, path] of Object.entries(distManifest.icons)) {
      if (!checkFile(`dist/${path}`, `  全局图标 ${size}x${size}`)) {
        allOk = false;
      }
    }
  }
  
  return allOk;
}

function checkSourceIcons() {
  log('\n=== 检查源文件图标 ===', 'cyan');
  
  let allOk = true;
  allOk = checkFile('src/assets/icon16.png', '16x16 图标') && allOk;
  allOk = checkFile('src/assets/icon48.png', '48x48 图标') && allOk;
  allOk = checkFile('src/assets/icon128.png', '128x128 图标') && allOk;
  
  return allOk;
}

function checkDistIcons() {
  log('\n=== 检查构建产物图标 ===', 'cyan');
  
  const distExists = existsSync(resolve(rootDir, 'dist'));
  if (!distExists) {
    log('⚠ dist 目录不存在，请先运行 npm run build', 'yellow');
    return null;
  }
  
  let allOk = true;
  allOk = checkFile('dist/assets/icon16.png', '构建后 16x16 图标') && allOk;
  allOk = checkFile('dist/assets/icon48.png', '构建后 48x48 图标') && allOk;
  allOk = checkFile('dist/assets/icon128.png', '构建后 128x128 图标') && allOk;
  
  return allOk;
}

function checkCodeReferences() {
  log('\n=== 检查代码中的图标引用 ===', 'cyan');
  
  const backgroundPath = resolve(rootDir, 'src/background/index.ts');
  if (!existsSync(backgroundPath)) {
    log('✗ src/background/index.ts 不存在', 'red');
    return false;
  }
  
  const content = readFileSync(backgroundPath, 'utf-8');
  
  // 检查通知图标路径
  if (content.includes("'assets/icon128.png'")) {
    log('✓ 通知图标路径正确 (assets/icon128.png)', 'green');
  } else if (content.includes("'assets/icon128.jpg'")) {
    log('✗ 通知图标路径错误 (使用了 .jpg 而不是 .png)', 'red');
    return false;
  } else {
    log('⚠ 未找到通知图标引用', 'yellow');
  }
  
  return true;
}

function main() {
  log('╔══════════════════════════════════════╗', 'cyan');
  log('║   Clipsey 图标验证工具               ║', 'cyan');
  log('╚══════════════════════════════════════╝', 'cyan');
  
  const results = {
    manifest: checkManifest(),
    source: checkSourceIcons(),
    dist: checkDistIcons(),
    code: checkCodeReferences()
  };
  
  log('\n=== 验证总结 ===', 'cyan');
  
  const allPassed = Object.entries(results)
    .filter(([key]) => key !== 'dist' || results.dist !== null)
    .every(([, value]) => value === true);
  
  if (allPassed) {
    log('\n✓ 所有检查通过！图标配置正确。', 'green');
    process.exit(0);
  } else {
    log('\n✗ 发现问题，请查看上述错误信息。', 'red');
    process.exit(1);
  }
}

main();
