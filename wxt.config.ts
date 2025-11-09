import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: 'src',
  outDir: '.output',
  
  manifest: {
    name: 'Clipsey',
    short_name: 'Clipsey',
    description: 'Clipsey 是一款轻量的网页摘录与高亮工具,支持选中内容保存、来源定位、颜色标注、弹窗检索与管理。',
    version: '1.0.0',
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
      '16': '/icon16.png',
      '48': '/icon48.png',
      '128': '/icon128.png'
    },
    action: {
      default_icon: {
        '16': '/icon16.png',
        '48': '/icon48.png',
        '128': '/icon128.png'
      }
    },
    // 配置选项页面，使用 options_ui 并强制在新标签页打开
    // 说明：部分浏览器版本在调用 chrome.runtime.openOptionsPage 时，
    // 若未正确声明 options 页面，可能回退到扩展详情页。
    // 使用 options_ui.open_in_tab 可以明确行为，避免跳转到扩展详情页。
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    }
  },
  
  vite: () => ({
    resolve: {
      alias: {
        '@': '/src'
      }
    }
    // 注：manualChunks 与 WXT 的 inlineDynamicImports 冲突，由 WXT 自动处理代码分割
  }),

  hooks: {
    'build:done': async () => {
      console.log('✅ 构建完成！');
    }
  }
});
