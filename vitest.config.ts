import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import wxtConfig from './wxt.config.ts';

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
        'src/background/**/*.ts',
        'src/content/**/*.ts',
        'src/utils/**/*.ts',
        'src/composables/**/*.ts'
      ],
      exclude: [
        'src/options/**',
        'src/popup/**',
        'src/background/dev-tools.ts'
      ]
    }
  },
  ...wxtConfig.vite?.()
});