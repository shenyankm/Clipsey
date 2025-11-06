import 'ant-design-vue/dist/reset.css'; // Ant Design Vue 基础重置样式（v4）
import './layout.css'; // 控制扩展弹窗窗口尺寸的最小布局样式
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import App from './App.vue';

createApp(App)
  .use(Antd)
  .mount('#app');
