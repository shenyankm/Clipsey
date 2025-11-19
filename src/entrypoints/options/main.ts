import 'vfonts/Inter.css'; // 拉丁字体
import 'vfonts/FiraCode.css'; // 等宽字体
import 'ant-design-vue/dist/reset.css'; // Ant Design Vue 基础重置样式（v4）
import { createApp } from 'vue';
import App from '@/options/App.vue';
// 按需注册 Ant Design Vue 组件，避免全量引入导致体积膨胀
import {
  ConfigProvider,
  Card,
  Tabs,
  Form,
  Select,
  Divider,
  Space,
  Switch,
  Mentions,
  Radio,
  Row,
  Col,
  Button,
  Empty,
  Table,
  Tag,
  Popconfirm,
  Pagination,
  Modal,
  Typography,
} from 'ant-design-vue';

import i18n, { initI18nLocale } from '@/utils/i18n';

const app = createApp(App);

app
  .use(i18n)
  .use(ConfigProvider)
  .use(Card)
  .use(Tabs)
  .use(Form)
  .use(Select)
  .use(Divider)
  .use(Space)
  .use(Switch)
  .use(Mentions)
  .use(Radio)
  .use(Row)
  .use(Col)
  .use(Button)
  .use(Empty)
  .use(Table)
  .use(Tag)
  .use(Popconfirm)
  .use(Pagination)
  .use(Modal)
  .use(Typography)
  .mount('#app');

// 初始化 i18n 语言设置
initI18nLocale();
