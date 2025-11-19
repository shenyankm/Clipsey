import 'ant-design-vue/dist/reset.css'; // Ant Design Vue 基础重置样式（v4）
import '@/popup/layout.css'; // 控制扩展弹窗窗口尺寸的最小布局样式
import { createApp } from 'vue';
import App from '@/popup/App.vue';
import i18n, { initI18nLocale } from '@/utils/i18n';
// 按需注册 Ant Design Vue 组件，避免全量引入导致体积膨胀
import {
  ConfigProvider,
  Row,
  Col,
  Typography,
  Tooltip,
  Button,
  Divider,
  Spin,
  Empty,
  Space,
  List,
  Card,
} from 'ant-design-vue';

const app = createApp(App);

app
  .use(i18n)
  .use(ConfigProvider)
  .use(Row)
  .use(Col)
  .use(Typography)
  .use(Tooltip)
  .use(Button)
  .use(Divider)
  .use(Spin)
  .use(Empty)
  .use(Space)
  .use(List)
  .use(Card)
  .mount('#app');

// 初始化 i18n 语言设置
initI18nLocale();

