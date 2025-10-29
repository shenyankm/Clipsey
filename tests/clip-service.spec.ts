import { describe, it, expect, vi } from 'vitest';
import { clipService } from '@/background/services/clip-service';

// Mock storage functions
vi.mock('@/background/storage', () => {
  const clips: any[] = [];
  return {
    addClip: vi.fn(async (clip: any) => { clips.unshift({ ...clip }); }),
    clearClips: vi.fn(async () => { clips.length = 0; }),
    getClips: vi.fn(async () => clips.map(c => ({ ...c }))),
    getClipsForUrl: vi.fn(async (url: string) => clips.filter(c => c.sourceUrl === url).map(c => ({ ...c }))),
    saveClips: vi.fn(async (arr: any[]) => { clips.length = 0; clips.push(...arr.map(c => ({ ...c }))); })
  };
});

describe('ClipService', () => {
  it('adds and lists clips', async () => {
    await clipService.add({ id: '1', sourceUrl: 'https://a', textContent: 'x', createdAt: new Date().toISOString() } as any);
    const list = await clipService.listAll();
    expect(list.length).toBe(1);
    expect(list[0].sourceUrl).toBe('https://a');
  });

  it('filters by url', async () => {
    await clipService.add({ id: '2', sourceUrl: 'https://b', textContent: 'y', createdAt: new Date().toISOString() } as any);
    const listA = await clipService.listByUrl('https://a');
    expect(listA.length).toBe(1);
    const listB = await clipService.listByUrl('https://b');
    expect(listB.length).toBe(1);
  });

  it('replaces and clears clips', async () => {
    await clipService.replaceAll([{ id: '3', sourceUrl: 'https://c', textContent: 'z', createdAt: new Date().toISOString() } as any]);
    let list = await clipService.listAll();
    expect(list.length).toBe(1);
    await clipService.clear();
    list = await clipService.listAll();
    expect(list.length).toBe(0);
  });
});