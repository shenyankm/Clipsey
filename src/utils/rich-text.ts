import DOMPurify from 'dompurify';
import type { Clip } from '@/types/clip';

function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function convertTextToHtml(text: string): string {
  if (!text) {
    return '';
  }
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r|\n/g, '<br />');
  return escaped;
}

const clipContentCache = new WeakMap<Clip, string>();

export function getClipHtmlContent(clip: Clip): string {
  if (!clip) {
    return '';
  }

  const cached = clipContentCache.get(clip);
  if (cached !== undefined) {
    return cached;
  }

  const rawHtml = clip.htmlContent?.trim();
  const html = rawHtml && rawHtml.length > 0
    ? sanitizeHtml(rawHtml)
    : sanitizeHtml(convertTextToHtml(clip.textContent?.trim() ?? ''));

  clipContentCache.set(clip, html);
  return html;
}

export function hasClipRichContent(clip: Clip): boolean {
  if (!clip) {
    return false;
  }
  if (clip.htmlContent?.trim()) {
    return true;
  }
  return !!clip.textContent?.trim();
}
