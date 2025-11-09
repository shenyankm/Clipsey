import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import wxtConfig from './wxt.config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/background/handlers/**/*.ts',
        'src/background/services/**/*.ts',
        'src/content/highlight-engine.ts',
        'src/content/color-manager.ts'
      ],
      exclude: [
        'src/options/**',
        'src/popup/**',
        'src/background/dev-tools.ts',
        'src/background/storage.ts',
        'src/background/indexeddb*.ts',
        'src/utils/**',
        'src/types/**',
        'src/content/selection.ts'
      ]
    }
  },
  // 复用 WXT 的 Vite 配置
  ...wxtConfig.vite?.()
});