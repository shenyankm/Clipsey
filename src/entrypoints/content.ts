import { initSelectionContentScript } from '@/content/selection';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  
  async main() {
    const dispose = initSelectionContentScript();
    return () => {
      dispose();
    };
  }
});

