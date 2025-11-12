import { browser } from 'wxt/browser';
import { registerMessageRouter } from '@/background/handlers/message-router';
import { extensionLifecycle } from '@/background/lifecycle/extension-lifecycle';
import { contextMenuManager } from '@/background/lifecycle/context-menu-manager';
import { selectionRequestManager } from '@/background/lifecycle/selection-request-manager';
import { tabHighlightManager } from '@/background/lifecycle/tab-highlight-manager';
import { listenerManager } from '@/background/lifecycle/listener-cleanup';

export default defineBackground(() => {
  // 安装/更新阶段
  browser.runtime.onInstalled.addListener(async () => {
    await extensionLifecycle.onInstalled();
    await contextMenuManager.create();
  });

  browser.runtime.onStartup.addListener(async () => {
    await extensionLifecycle.onStartup();
  });

  // 统一管理右键菜单
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== contextMenuManager.getMenuId() || !tab) {
      return;
    }
    void selectionRequestManager.handleContextMenuClick(info, tab);
  });

  const disposeMessageRouter = registerMessageRouter();
  tabHighlightManager.registerListener();

  let cleaned = false;
  const cleanupAll = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    disposeMessageRouter();
    listenerManager.cleanup();
  };

  const suspendHandler = () => {
    cleanupAll();
    browser.runtime.onSuspend?.removeListener(suspendHandler);
  };

  if (browser.runtime.onSuspend) {
    browser.runtime.onSuspend.addListener(suspendHandler);
  }

  return () => {
    cleanupAll();
    if (browser.runtime.onSuspend?.hasListener?.(suspendHandler)) {
      browser.runtime.onSuspend.removeListener(suspendHandler);
    }
  };
});
