export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  
  async main() {
    // 导入并执行content script代码
    await import('@/content/selection');
  }
});
