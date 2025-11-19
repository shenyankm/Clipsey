import { defineConfig } from 'wxt';
import { randomBytes } from 'node:crypto';
import packageData from './package.json' with { type: 'json' };
import { OPTIONAL_HOST_PERMISSION_LIST, LOCALHOST_DEBUG_ORIGINS } from './src/constants/hosts';

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
  '一个专注于网页摘录的工具，支持选区保存、自动记录来源、彩色注释、快捷键等高效信息整理体验。';

const REQUIRED_HOST_PERMISSIONS: string[] = [];
const OPTIONAL_HOSTS = [...OPTIONAL_HOST_PERMISSION_LIST];
const LOCALHOST_ORIGINS = [...LOCALHOST_DEBUG_ORIGINS];

const createSandboxNonce = (): string =>
  randomBytes(16)
    .toString('base64')
    .replace(/[+/=]/g, '');

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: 'src',
  outDir: '.output',
  
  manifest: async () => {
    const isDev = process.env.NODE_ENV !== 'production';
    const sandboxNonce = createSandboxNonce();
    const extensionPageConnectSrc = ["'self'"];
    if (isDev) {
      extensionPageConnectSrc.push('http://localhost:*');
    }

    const sandboxScriptSrc = ["'self'", `'nonce-${sandboxNonce}'`];
    if (isDev) {
      sandboxScriptSrc.push('http://localhost:*');
    }

    const requiredHostPermissions = [...REQUIRED_HOST_PERMISSIONS];
    const optionalHostPermissions = [...OPTIONAL_HOSTS];
    const hostPermissions = isDev
      ? [...requiredHostPermissions, ...LOCALHOST_ORIGINS]
      : requiredHostPermissions;

    const manifest = {
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
      host_permissions: hostPermissions,
      ...(optionalHostPermissions.length ? { optional_host_permissions: optionalHostPermissions } : {}),
      content_security_policy: {
        extension_pages: `script-src 'self'; object-src 'self'; connect-src ${extensionPageConnectSrc.join(' ')};`,
        sandbox: [
          'sandbox allow-scripts allow-forms allow-popups allow-modals',
          `script-src ${sandboxScriptSrc.join(' ')}`,
          "child-src 'self'"
        ].join('; ') + ';'
      },
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
    };

    return manifest;
  },
  
  vite: () => ({
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    define: {
      __INTLIFY_PROD_DEVTOOLS__: false
    },
    json: {
      stringify: true
    }
  }),

  hooks: {
    'build:done': async () => {
      console.log('构建完成');
    }
  }
});
