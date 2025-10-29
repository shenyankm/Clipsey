import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Clip } from '@/types/clip';
// Mock clipService BEFORE importing handler
vi.mock('@/background/services/clip-service', () => {
  return {
    clipService: {
      listByUrl: vi.fn(async (_url: string) => []),
      add: vi.fn(async (_clip: Clip) => {})
    }
  };
});
// clipService will be imported fresh inside tests after resetting modules

describe('handleSaveClip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('builds clip and calls add (new clip)', async () => {
    const { handleSaveClip } = await import('@/background/handlers/save-clip');
    const { clipService } = await import('@/background/services/clip-service');
    (clipService.listByUrl as any).mockResolvedValueOnce([]);
    await handleSaveClip({ textContent: 'abc', sourceUrl: 'https://a', title: 'T' });
    expect((clipService.add as any).mock.calls.length).toBe(1);
    const arg = (clipService.add as any).mock.calls[0][0] as Clip;
    expect(arg.textContent).toBe('abc');
    expect(arg.sourceUrl).toBe('https://a');
    expect(arg.highlightStyle).toBe('inline');
    expect(typeof arg.id).toBe('string');
    expect(typeof arg.createdAt).toBe('string');
  });

  it('uses overlay style when provided while updating by highlightId', async () => {
    const existing: Clip = {
      id: 'old',
      sourceUrl: 'https://a',
      textContent: 'abc',
      createdAt: '2020-01-01T00:00:00.000Z',
      highlightId: 'h1',
      textOffset: 10,
      highlightStyle: 'overlay'
    } as any;
    const { handleSaveClip } = await import('@/background/handlers/save-clip');
    const { clipService } = await import('@/background/services/clip-service');
    (clipService.listByUrl as any).mockResolvedValueOnce([]);
    await handleSaveClip({ textContent: 'abc', sourceUrl: 'https://a', highlightId: 'h1', highlightStyle: 'overlay', textOffset: 10 });
    const arg = (clipService.add as any).mock.calls[0][0] as Clip;
    expect(typeof arg.createdAt).toBe('string');
    expect(arg.highlightStyle).toBe('overlay');
    expect(arg.textOffset).toBe(10);
  });

  it('overrides textOffset when provided as number', async () => {
    const existing: Clip = {
      id: 'old',
      sourceUrl: 'https://a',
      textContent: 'abc',
      createdAt: '2020-01-01T00:00:00.000Z',
      highlightId: 'h1',
      textOffset: 10,
      highlightStyle: 'inline'
    } as any;
    const { handleSaveClip } = await import('@/background/handlers/save-clip');
    const { clipService } = await import('@/background/services/clip-service');
    (clipService.listByUrl as any).mockResolvedValueOnce([existing]);
    await handleSaveClip({ textContent: 'abc', sourceUrl: 'https://a', highlightId: 'h1', textOffset: 42 });
    const arg = (clipService.add as any).mock.calls[0][0] as Clip;
    expect(arg.textOffset).toBe(42);
  });
});