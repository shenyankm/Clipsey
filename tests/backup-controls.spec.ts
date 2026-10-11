import { createApp, h, nextTick, type App } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BackupControls from '@/options/components/clip/BackupControls.vue';
import { sendRuntimeMessage } from '@/utils/chrome';

const ui = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), confirm: vi.fn() }));
vi.mock('ant-design-vue', () => ({ message: ui, Modal: { confirm: ui.confirm } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, params?: { count: number }) =>
  params ? `${key}: ${params.count}` : key }) }));
vi.mock('@/utils/chrome', () => ({ sendRuntimeMessage: vi.fn() }));

let app: App;
let container: HTMLDivElement;
const restored = vi.fn();
const backup = { clips: [{ id: 'saved', textContent: 'Quote: "你好 👋"\nNext line',
  htmlContent: '<p title="quoted">你好 👋</p>', sourceUrl: 'https://example.com',
  createdAt: '2026-10-11T00:00:00Z' }], errorLogs: [], version: '2.0', exportedAt: '2026-10-11T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BROWSER', 'chrome');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:backup'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp(BackupControls, { onRestored: restored });
  app.component('a-space', (_, { slots }) => h('div', slots.default?.()));
  app.component('a-button', { template: '<button><slot /></button>' });
  app.mount(container);
});
afterEach(() => {
  app.unmount();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function chooseFile(data: unknown, invalidJSON = false) {
  const input = container.querySelector('input')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [{
    text: () => Promise.resolve(invalidJSON ? '{' : JSON.stringify(data))
  }] });
  input.dispatchEvent(new Event('change'));
  await nextTick();
  await vi.waitFor(() => expect(ui.confirm.mock.calls.length + ui.error.mock.calls.length).toBeGreaterThan(0));
}

it.each(['chrome', 'edge', 'firefox'])('downloads a %s JSON backup and releases the object URL', async browser => {
  vi.stubEnv('BROWSER', browser);
  vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true, data: browser === 'firefox' ? JSON.stringify(backup) : backup });
  container.querySelector('button')!.click();
  await vi.waitFor(() => expect(ui.success).toHaveBeenCalledWith('backupExported'));
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  const text = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
  expect(JSON.parse(text)).toEqual(backup);
  expect(text).toBe(JSON.stringify(backup));
  expect(sendRuntimeMessage).toHaveBeenCalledWith({ type: browser === 'firefox' ? 'EXPORT_BACKUP_JSON' : 'EXPORT_DATA' });
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect((vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement).download).toMatch(/^clipsey-backup-.*\.json$/);
  await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup'));
});

it.each(['chrome', 'firefox'])('reports a %s export failure without creating a download', async browser => {
  vi.stubEnv('BROWSER', browser);
  vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({ success: false, error: 'Failed to read storage' });
  container.querySelector('button')!.click();
  await vi.waitFor(() => expect(ui.error).toHaveBeenCalledWith('backupExportFailed'));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(ui.success).not.toHaveBeenCalled();
});

it('reports an unavailable runtime without creating a download', async () => {
  vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(new Error('No receiver'));
  container.querySelector('button')!.click();
  await vi.waitFor(() => expect(ui.error).toHaveBeenCalledWith('backupExportFailed'));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(ui.success).not.toHaveBeenCalled();
});

it.each([backup, { clips: [] }])('validates before confirmation and restores only after approval: %j', async data => {
  await chooseFile(data);
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  const confirm = ui.confirm.mock.calls[0][0];
  expect(confirm.content).toBe(`backupRestoreConfirm: ${data.clips.length}`);
  expect(container.querySelector('button')!.disabled).toBe(true);
  vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true });
  await confirm.onOk();
  await nextTick();
  expect(sendRuntimeMessage).toHaveBeenCalledWith({ type: 'IMPORT_DATA', payload: data });
  expect(restored).toHaveBeenCalledTimes(1);
  expect(container.querySelector('button')!.disabled).toBe(false);
});

it('cancels restoration without writing and allows another attempt', async () => {
  await chooseFile(backup);
  ui.confirm.mock.calls[0][0].onCancel();
  await nextTick();
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(container.querySelector('button')!.disabled).toBe(false);
  expect(restored).not.toHaveBeenCalled();
});

it.each([null, {}, { clips: [{ textContent: 'oops' }] }, { clips: [], errorLogs: 'invalid' }])(
  'rejects invalid backup %j before asking to overwrite', async data => {
    await chooseFile(data);
    expect(ui.error).toHaveBeenCalledWith('backupInvalid');
    expect(ui.confirm).not.toHaveBeenCalled();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
  }
);

it('rejects invalid JSON before confirmation', async () => {
  await chooseFile(null, true);
  expect(ui.confirm).not.toHaveBeenCalled();
  expect(ui.error).toHaveBeenCalledWith('backupInvalid');
});

it('reports a failed restore and sends no success or restored event', async () => {
  await chooseFile(backup);
  vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: false, error: 'Quota exceeded' });
  await ui.confirm.mock.calls[0][0].onOk();
  expect(ui.error).toHaveBeenCalledWith('backupRestoreFailed');
  expect(ui.success).not.toHaveBeenCalled();
  expect(restored).not.toHaveBeenCalled();
});
