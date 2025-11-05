import { settingsService } from '@/background/services/settings-service';

export async function handleRequestSettings(): Promise<Record<string, unknown>> {
  const value = await settingsService.read<Record<string, unknown>>();
  return value ?? {};
}