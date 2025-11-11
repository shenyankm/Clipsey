import 'webextension-polyfill';
import { browser } from 'wxt/browser';
import { registerMessageRouter } from '@/background/handlers/message-router';
import { extensionLifecycle } from '@/background/lifecycle/extension-lifecycle';
import { contextMenuManager } from '@/background/lifecycle/context-menu-manager';
import { selectionRequestManager } from '@/background/lifecycle/selection-request-manager';
import { tabHighlightManager } from '@/background/lifecycle/tab-highlight-manager';
import { listenerManager } from '@/background/lifecycle/listener-cleanup';

export default defineBackground(() => {

  // 安装或更新阶段
  browser.runtime.onInstalled.addListener(async () => {
    await extensionLifecycle.onInstalled();
    await contextMenuManager.create();
  });

  browser.runtime.onStartup.addListener(async () => {
    await extensionLifecycle.onStartup();
  });

  // 统一处理右键菜单
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== contextMenuManager.getMenuId() || !tab) {
      return;
    }
    void selectionRequestManager.handleContextMenuClick(info, tab);
  });

  // 注册消息路由
  registerMessageRouter();

  // 监听标签页变更
  tabHighlightManager.registerListener();
});
