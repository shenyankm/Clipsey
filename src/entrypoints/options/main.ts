import 'ant-design-vue/dist/reset.css';
import App from '@/options/App.vue';
import { createExtensionApp } from '@/utils/create-extension-app';
import { initI18nLocale } from '@/utils/i18n';
import {
  ConfigProvider,
  Card,
  Tabs,
  Typography,
  Spin,
  Alert,
  Space,
  Input,
  Button,
  Radio,
  Empty,
  Popconfirm,
  Tag,
  Table,
  Pagination,
  Modal,
  Select,
  Form,
  Divider,
  Switch,
} from 'ant-design-vue';

const app = createExtensionApp(App, {
  plugins: [
    ConfigProvider,
    Card,
    Tabs,
    Typography,
    Spin,
    Alert,
    Space,
    Input,
    Button,
    Radio,
    Empty,
    Popconfirm,
    Tag,
    Table,
    Pagination,
    Modal,
    Select,
    Form,
    Divider,
    Switch,
  ]
});


void (async () => {
  await initI18nLocale();
  app.mount('#app');
})();
