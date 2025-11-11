import { defineConfig } from 'wxt';
import packageData from './package.json' assert { type: 'json' };

type PackageMeta = {
  name: string;
  version?: string;
  description?: string;
  displayName?: string;
};

const packageJson = packageData as PackageMeta;

const APP_NAME = packageJson.displayName ?? packageJson.name ?? 'Clipsey';
const APP_DESCRIPTION =
  packageJson.description?.trim() ??
  '一款专注网页摘录的工具，支持选区存档、自动记录来源、颜色注释与快捷键等高效信息管理体验。';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: 'src',
  outDir: '.output',
  
  manifest: async () => ({
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    version: packageJson.version ?? '1.0.0',
    permissions: [
      'contextMenus',
      'storage',
      'scripting',
      'notifications',
      'activeTab',
      'tabs'
    ],
    host_permissions: [
      'https://*/*',
      'http://*/*'
    ],
    icons: {
      '16': 'icon16.png',
      '48': 'icon48.png',
      '128': 'icon128.png'
    },
    action: {
      default_icon: {
        '16': 'icon16.png',
        '48': 'icon48.png',
        '128': 'icon128.png'
      }
    }
  }),
  
  vite: () => ({
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }),

  hooks: {
    'build:done': async () => {
      console.log('✅ 构建完成');
    }
  }
});
