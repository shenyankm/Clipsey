import { defineConfig, type Plugin } from 'vite';
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
    writeBundle() {
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
    }
  };
}

export default defineConfig({
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
        background: resolve(root, 'background/index.ts'),
        content: resolve(root, 'content/selection.ts')
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
        manualChunks: () => undefined
      }
    }
  }
});
