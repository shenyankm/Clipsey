import 'ant-design-vue/dist/reset.css'; // Ant Design Vue ����������ʽ��v4��
import '@/popup/layout.css'; // ������չ�������ڳߴ����С������ʽ
import App from '@/popup/App.vue';
import { createExtensionApp } from '@/utils/create-extension-app';
import { initI18nLocale } from '@/utils/i18n';
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

const app = createExtensionApp(App, {
  plugins: [
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
  ]
});

app.mount('#app');

// ��ʼ�� i18n ��������
initI18nLocale();
