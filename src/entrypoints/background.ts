import { registerMessageRouter } from '@/background/handlers/message-router';
import { extensionLifecycle } from '@/background/lifecycle/extension-lifecycle';
import { contextMenuManager } from '@/background/lifecycle/context-menu-manager';
import { selectionRequestManager } from '@/background/lifecycle/selection-request-manager';
import { tabHighlightManager } from '@/background/lifecycle/tab-highlight-manager';
import { listenerManager } from '@/background/lifecycle/listener-cleanup';

export default defineBackground(() => {

  // 初始化生命周期管理器
  chrome.runtime.onInstalled.addListener(async () => {
    await extensionLifecycle.onInstalled();
    await contextMenuManager.create();
  });

  chrome.runtime.onStartup.addListener(async () => {
    await extensionLifecycle.onStartup();
  });

  // 注册上下文菜单点击处理
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== contextMenuManager.getMenuId() || !tab) {
      return;
    }
    void selectionRequestManager.handleContextMenuClick(info, tab);
  });

  // 使用消息路由处理所有 runtime 消息
  registerMessageRouter();

  // 注册标签页更新监听器
  tabHighlightManager.registerListener();
});
