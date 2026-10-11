import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const exportAllData = vi.hoisted(() => vi.fn());
vi.mock('@/background/api', () => ({ exportAllData,
  deleteClipById: vi.fn(), importAllData: vi.fn(), refreshClipsCache: vi.fn() }));
vi.mock('@/background/services/clip-service', () => ({ clipService: {} }));
vi.mock('wxt/browser', () => ({ browser: {} }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('BROWSER', 'firefox'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it.each(['chrome', 'edge'])('keeps the JSON handler out of the %s build', async browser => {
  vi.stubEnv('BROWSER', browser);
  const { registry } = await import('@/background/handlers/registry');
  expect(registry.has('EXPORT_BACKUP_JSON')).toBe(false);
  expect(registry.has('EXPORT_DATA')).toBe(true);
});

it('returns compact JSON without changing the original object export or envelope', async () => {
  const data = Object.freeze({ clips: [Object.freeze({ id: 'clip', textContent: '你好 👋 "quote"\nnext',
    htmlContent: '<p title="quoted">🙂</p>', createdAt: '2026-10-12T00:00:00Z' })],
    errorLogs: [{ id: 'log', message: 'saved error' }], exportedAt: '2026-10-12T00:00:00Z', version: '2.0' });
  exportAllData.mockResolvedValue(data);
  const { registry } = await import('@/background/handlers/registry');
  const json = await registry.get('EXPORT_BACKUP_JSON')!({ type: 'EXPORT_BACKUP_JSON' }, {});
  expect(json).toEqual({ success: true, data: JSON.stringify(data) });
  expect(JSON.parse(json.data as string)).toEqual(data);
  expect(await registry.get('EXPORT_DATA')!({ type: 'EXPORT_DATA' }, {})).toEqual({ success: true, data });
});

it.each(['read', 'serialization'])('propagates a %s failure without returning a partial backup', async failure => {
  if (failure === 'read') exportAllData.mockRejectedValue(new Error('IndexedDB storage failed'));
  else exportAllData.mockResolvedValue({ clips: [], errorLogs: [{ unsupported: 1n }] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { registry } = await import('@/background/handlers/registry');
  const result = await registry.get('EXPORT_BACKUP_JSON')!({ type: 'EXPORT_BACKUP_JSON' }, {});
  expect(result.success).toBe(false);
  expect(result.error).toBeTruthy();
  expect(result).not.toHaveProperty('data');
});
