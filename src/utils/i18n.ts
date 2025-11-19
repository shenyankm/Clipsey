import { createI18n } from 'vue-i18n';
import zhCN from '@/assets/locales/zh-CN.json';
import enUS from '@/assets/locales/en-US.json';
import { readSettingsLocal, watchSettingsLocal } from '@/utils/settings-local';

// Type-define 'en-US' as the master schema for the resource
type MessageSchema = typeof enUS;

const i18n = createI18n<[MessageSchema], 'zh-CN' | 'en-US'>({
  legacy: false, // Vue 3 Composition API mode
  locale: 'zh-CN', // default locale
  fallbackLocale: 'en-US',
  globalInjection: true, // 全局注入 $t
  missingWarn: true, // 开发环境下警告缺失的翻译
  fallbackWarn: true, // 开发环境下警告回退翻译
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

/**
 * 初始化 i18n 语言设置：从存储中读取用户偏好并应用
 * 同时监听设置变化以动态更新语言
 */
export async function initI18nLocale(): Promise<void> {
  try {
    const settings = await readSettingsLocal();
    const targetLocale = settings.language || 'zh-CN';
    const locale = i18n.global.locale as any;
    if (locale.value !== targetLocale) {
      locale.value = targetLocale;
      console.log('[i18n] Locale changed to:', targetLocale);
    }
  } catch (error) {
    console.warn('[i18n] Failed to load locale from settings:', error);
  }

  // 监听设置变化，动态更新语言
  watchSettingsLocal((newSettings) => {
    const newLocale = newSettings.language || 'zh-CN';
    const locale = i18n.global.locale as any;
    if (locale.value !== newLocale) {
      locale.value = newLocale;
      console.log('[i18n] Locale updated to:', newLocale);
    }
  });
}

export default i18n;
