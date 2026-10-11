import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightSyncService } from '@/background/services/highlight-sync-service';
import { contentScriptService } from '@/background/services/content-script-service';

const query = vi.hoisted(() => vi.fn());
const hasPermission = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('wxt/browser', () => ({ browser: { tabs: { query } } }));
vi.mock('@/background/services/permissions-service', () => ({
  permissionsService: { hasHostPermissionForUrl: hasPermission }
}));
vi.mock('@/background/services/content-script-service', () => ({
  contentScriptService: { sendMessageToTab: vi.fn().mockResolvedValue({ success: true }) }
}));

beforeEach(() => vi.clearAllMocks());

describe('deleted highlight sync', () => {
  it('removes the last highlight without consulting automatic highlight settings', async () => {
    query.mockResolvedValue([
      { id: 1, url: 'https://example.com/article?view=1' },
      { id: 2, url: 'https://other.example/article' }
    ]);
    await highlightSyncService.removePageHighlight('https://example.com/article', 'last');
    expect(contentScriptService.sendMessageToTab).toHaveBeenCalledTimes(1);
    expect(contentScriptService.sendMessageToTab).toHaveBeenCalledWith(1, {
      type: 'REMOVE_HIGHLIGHT', payload: { highlightId: 'last' }
    });
  });

  it('continues notifying other matching tabs when one receiver is unavailable', async () => {
    query.mockResolvedValue([
      { id: 1, url: 'https://example.com/article' },
      { id: 2, url: 'https://example.com/article' }
    ]);
    vi.mocked(contentScriptService.sendMessageToTab).mockRejectedValueOnce(new Error('No receiver'));
    await highlightSyncService.removePageHighlight('https://example.com/article', 'deleted');
    expect(contentScriptService.sendMessageToTab).toHaveBeenCalledTimes(2);
  });
});
