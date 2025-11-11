declare module 'webextension-polyfill' {
  import type { WxtBrowser } from 'wxt/browser';

  const browser: WxtBrowser;
  export default browser;
  export type Browser = WxtBrowser;
}
