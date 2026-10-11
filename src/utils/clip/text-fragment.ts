import type { Clip } from '@/types/clip';

export function stripTextFragment(sourceUrl: string): string {
  if (!sourceUrl.includes(':~:')) return sourceUrl;
  const url = new URL(sourceUrl);
  const anchor = url.hash.split(':~:')[0];
  url.hash = anchor === '#' ? '' : (anchor ?? '');
  return url.href;
}

export function createTextFragmentUrl(clip: Clip): string {
  const url = new URL(clip.sourceUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported source URL');
  }
  const lines = clip.textContent.trim().split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) return url.href;
  const encode = (text: string) => encodeURIComponent(text).replace(/-/g, '%2D');
  // 多段摘录用起止文本，单个 text 指令不能跨越块级元素。
  const directive = lines.length > 1
    ? `${encode(lines[0]!)},${encode(lines[lines.length - 1]!)}`
    : encode(lines[0]!);
  const anchor = url.hash.split(':~:')[0];
  url.hash = `${anchor || '#'}:~:text=${directive}`;
  return url.href;
}
