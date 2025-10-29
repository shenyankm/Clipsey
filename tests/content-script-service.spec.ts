import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentScriptService } from '@/background/services/content-script-service';

describe('ContentScriptService', () => {
  let service: ContentScriptService;

  beforeEach(() => {
    service = new ContentScriptService();
  });

  it('registers content script and ignores duplicate id error', async () => {
    const unregister = vi.spyOn(chrome.scripting, 'unregisterContentScripts').mockResolvedValueOnce();
    const register = vi.spyOn(chrome.scripting, 'registerContentScripts').mockRejectedValueOnce(new Error('duplicate script id'));

    await service.registerContentScript();
    expect(unregister).toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
  });

  it('registers content script and tolerates nonexistent script error on unregister', async () => {
    const unregister = vi.spyOn(chrome.scripting, 'unregisterContentScripts').mockRejectedValueOnce(new Error('No such content script'));
    const register = vi.spyOn(chrome.scripting, 'registerContentScripts').mockResolvedValueOnce();

    await service.registerContentScript();
    expect(unregister).toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
  });

  it('injects content script successfully', async () => {
    const exec = vi.spyOn(chrome.scripting, 'executeScript').mockResolvedValueOnce();
    const ok = await service.injectContentScript(1);
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalled();
  });

  it('injectContentScript returns false on inaccessible urls', async () => {
    vi.spyOn(chrome.scripting, 'executeScript').mockRejectedValueOnce(new Error('Cannot access contents of url'));
    const ok = await service.injectContentScript(2);
    expect(ok).toBe(false);
  });

  it('sendMessageToTab resolves with response', async () => {
    const spy = vi.spyOn(chrome.tabs, 'sendMessage').mockImplementation((_tabId, _msg, cb) => {
      cb({ foo: 'bar' });
    });
    const res = await service.sendMessageToTab<{ foo: string }>(3, { type: 'X' });
    expect(res.foo).toBe('bar');
    expect(spy).toHaveBeenCalled();
  });

  it('error helpers detect specific runtime errors', () => {
    expect(service.isMissingReceiverError(new Error('Receiving end does not exist'))).toBe(true);
    expect(service.isNoSuchContentScriptError(new Error('No such content script'))).toBe(true);
    expect(service.isDuplicateScriptIdError(new Error('duplicate script id'))).toBe(true);
    expect(service.isFrameRemovedError(new Error('Frame with id 123 removed'))).toBe(true);
  });
});