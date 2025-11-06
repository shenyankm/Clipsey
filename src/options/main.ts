import 'vfonts/Inter.css'; // 拉丁字体
import 'vfonts/FiraCode.css'; // 等宽字体
import 'ant-design-vue/dist/reset.css'; // Ant Design Vue 基础重置样式（v4）
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import App from './App.vue';

createApp(App)
  .use(Antd)
  .mount('#app');
