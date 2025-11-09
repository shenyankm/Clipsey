import { defineConfig, type Plugin, build as viteBuild } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, basename, posix } from 'path';
import {
  readdirSync,
  readFileSync,
  statSync,
  renameSync,
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync
} from 'fs';

const root = resolve(__dirname, 'src');
const assetsDir = resolve(root, 'assets');
const manifestPath = resolve(__dirname, 'manifest.json');

function chromeExtensionAssets(): Plugin {
  return {
    name: 'chrome-extension-assets',
    generateBundle() {
      const manifestSource = readFileSync(manifestPath, 'utf-8');
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: manifestSource
      });

      for (const file of readdirSync(assetsDir)) {
        const filePath = resolve(assetsDir, file);
        if (!statSync(filePath).isFile()) {
          continue;
        }

        this.emitFile({
          type: 'asset',
          fileName: `assets/${basename(filePath)}`,
          source: readFileSync(filePath)
        });
      }
    }
  };
}

function relocateHtmlEntries(): Plugin {
  return {
    name: 'relocate-html-entries',
    async writeBundle() {
      const mappings: Record<string, string> = {
        'src/popup/index.html': 'popup/index.html',
        'src/options/index.html': 'options/index.html'
      };
      const distDir = resolve(__dirname, 'dist');

      for (const [fromRelative, toRelative] of Object.entries(mappings)) {
        const fromPath = resolve(distDir, fromRelative);
        if (!existsSync(fromPath)) {
          continue;
        }

        const toPath = resolve(distDir, toRelative);
        mkdirSync(resolve(toPath, '..'), { recursive: true });
        renameSync(fromPath, toPath);

        const html = readFileSync(toPath, 'utf-8');
        const relativeDir = posix.dirname(toRelative);
        const relativeAssetsPath = posix
          .relative(relativeDir, 'assets')
          .replace(/\/$/, '');
        const assetPrefix = `${relativeAssetsPath}/`;
        const normalizedHtml = html.replace(/\.\.\/\.\.\/assets\//g, assetPrefix);
        writeFileSync(toPath, normalizedHtml);
      }

      const straySrcDir = resolve(distDir, 'src');
      if (existsSync(straySrcDir)) {
        rmSync(straySrcDir, { recursive: true, force: true });
      }
      
      // 单独构建 content script,使用 IIFE 格式不分割 chunk
      await viteBuild({
        configFile: false,
        root: __dirname,
        build: {
          outDir: 'dist',
          emptyOutDir: false, // 不清空输出目录
          lib: {
            entry: resolve(root, 'content/selection.ts'),
            name: 'ContentScript',
            formats: ['iife'], // 使用 IIFE 格式
            fileName: () => 'scripts/content.js'
          },
          rollupOptions: {
            output: {
              extend: true,
              // 内联所有依赖
              inlineDynamicImports: true
            }
          }
        },
        resolve: {
          alias: {
            '@': root
          }
        }
      });
      
      console.log('Content script built separately with IIFE format');
    }
  };
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    base: '',
    plugins: [vue(), chromeExtensionAssets(), relocateHtmlEntries()],
    resolve: {
      alias: {
        '@': root
      }
    },
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(root, 'popup/index.html'),
          options: resolve(root, 'options/index.html'),
          background: resolve(root, 'background/index.ts')
          // content script 将单独构建
        },
        output: {
          entryFileNames: chunk => {
            if (chunk.name === 'background' || chunk.name === 'content') {
              return `scripts/${chunk.name}.js`;
            }
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          // 自定义 chunk 分割:只为 HTML 入口(popup/options)分割 chunk
          // background 和 content 的依赖会自动内联
          manualChunks(id) {
            // 如果模块只被 background 或 content 使用,不分割
            // 如果模块被 HTML入口使用,分割为共享 chunk
            if (id.includes('node_modules')) {
              // Vue 相关模块只会被 HTML入口使用,分割为vendor chunk
              if (id.includes('vue') || id.includes('@vue') || id.includes('ant-design-vue')) {
                return 'vendor';
              }
            }
            // 其他所有模块不分割,保持内联
            return undefined;
          }
        },
        preserveEntrySignatures: false
      }
    }
  };
});
