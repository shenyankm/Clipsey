import 'vfonts/Inter.css'; // ���ּ���
import 'vfonts/FiraCode.css'; // �ȿ�����
import 'ant-design-vue/dist/reset.css'; // Ant Design Vue ����������ʽ��v4��
import App from '@/options/App.vue';
import { createExtensionApp } from '@/utils/create-extension-app';
import { initI18nLocale } from '@/utils/i18n';
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
  Spin,
  Alert,
} from 'ant-design-vue';

const app = createExtensionApp(App, {
  plugins: [
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
    Spin,
    Alert,
  ]
});

app.mount('#app');

// ��ʼ�� i18n ��������
initI18nLocale();
