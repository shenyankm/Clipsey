import 'vfonts/Inter.css';
import 'vfonts/FiraCode.css';
import 'ant-design-vue/dist/reset.css';
import App from '@/options/App.vue';
import { createExtensionApp } from '@/utils/create-extension-app';
import { initI18nLocale } from '@/utils/i18n';
import Antd from 'ant-design-vue';

const app = createExtensionApp(App, {
  plugins: [Antd]
});


void (async () => {
  await initI18nLocale();
  app.mount('#app');
})();
