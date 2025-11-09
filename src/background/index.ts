import { registerMessageRouter } from '@/background/handlers/message-router';
import { extensionLifecycle } from './lifecycle/extension-lifecycle';
import { contextMenuManager } from './lifecycle/context-menu-manager';
import { selectionRequestManager } from './lifecycle/selection-request-manager';
import { tabHighlightManager } from './lifecycle/tab-highlight-manager';
import { listenerManager } from './lifecycle/listener-cleanup';

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

// 导出清理函数，供测试或扩展卸载时调用
export function cleanup(): void {
  listenerManager.cleanup();
}









