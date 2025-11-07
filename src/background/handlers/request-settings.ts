import { readSettingsLocal, type SettingsOptions } from '@/utils/settings-local';

/**
 * 后台消息处理：返回基础设置（来源于 chrome.storage.local）
 * 为平滑迁移保留默认值与结构完整性。
 */
export async function handleRequestSettings(): Promise<SettingsOptions> {
  const value = await readSettingsLocal();
  return value;
}