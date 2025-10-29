import { describe, it, expect, vi } from 'vitest';
import { handleRequestClips } from '@/background/handlers/request-clips';
import { handleClearClips } from '@/background/handlers/clear-clips';

vi.mock('@/background/services/clip-service', () => ({
  clipService: {
    listAll: vi.fn(async () => [{ id: '1', sourceUrl: 'https://a', textContent: 't', createdAt: new Date().toISOString() }]),
    clear: vi.fn(async () => {})
  }
}));

import { clipService } from '@/background/services/clip-service';

describe('handlers request/clear', () => {
  it('returns list of clips', async () => {
    const result = await handleRequestClips();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].sourceUrl).toBe('https://a');
  });

  it('clears clips by delegating to service', async () => {
    await handleClearClips();
    expect((clipService.clear as any).mock.calls.length).toBe(1);
  });
});