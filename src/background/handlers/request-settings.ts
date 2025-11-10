import { readSettingsLocal, type SettingsOptions } from '@/utils/settings-local';

/** 请求设置处理：从 chrome.storage.local 读取并返回基础设置。 */
export async function handleRequestSettings(): Promise<SettingsOptions> {
  const value = await readSettingsLocal();
  return value;
}