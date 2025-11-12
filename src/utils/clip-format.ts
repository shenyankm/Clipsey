import type { Clip } from '@/types/clip';

export function formatClipDateTime(iso?: string): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export const formatClipDate = formatClipDateTime;

export function getClipDomain(url?: string): string {
  if (!url) return '';
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

export function formatClipUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const search = parsed.search ?? '';
    return `${parsed.protocol}//${parsed.hostname}${path}${search}`;
  } catch {
    return url;
  }
}

export function getClipPreview(clip: Clip, maxLength = 120): string {
  const content = clip.textContent ?? '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return clip.title?.trim() || '暂无内容';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}
