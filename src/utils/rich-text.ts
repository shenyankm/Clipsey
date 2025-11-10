import DOMPurify from 'dompurify';
import type { Clip } from '@/types/clip';
import type { Config } from 'dompurify';

/** XSS 防护：严格 HTML 净化配置（仅允许安全标签与属性，移除脚本与事件处理器）。 */
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'b', 'i', 's', 'del', 'ins',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'span', 'div',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'class',
  ],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  SAFE_FOR_TEMPLATES: true,
  RETURN_TRUSTED_TYPE: false,
};

// 净化 HTML，防止 XSS（非法或异常时返回空字符串）
function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  try {
    const sanitized = DOMPurify.sanitize(html.trim(), SANITIZE_CONFIG);
    return typeof sanitized === 'string' ? sanitized : String(sanitized);
  } catch (error) {
    console.error('HTML sanitization failed:', error);
    return '';
  }
}

// 纯文本转安全 HTML（严格转义所有特殊字符）
function convertTextToHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // 严格转义所有HTML特殊字符
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;') // 转义斜杠，防止闭合标签
    .replace(/\r\n|\r|\n/g, '<br />');
  
  return escaped;
}

const clipContentCache = new WeakMap<Clip, string>();

// 获取剪辑的安全 HTML 内容（含缓存）
export function getClipHtmlContent(clip: Clip): string {
  if (!clip || typeof clip !== 'object') {
    return '';
  }

  // 使用WeakMap缓存避免重复净化
  const cached = clipContentCache.get(clip);
  if (cached !== undefined) {
    return cached;
  }

  const rawHtml = clip.htmlContent?.trim();
  const textContent = clip.textContent?.trim();
  
  // 优先使用HTML内容，如果不存在则转换文本内容
  let html = '';
  if (rawHtml && rawHtml.length > 0) {
    html = sanitizeHtml(rawHtml);
  } else if (textContent && textContent.length > 0) {
    html = sanitizeHtml(convertTextToHtml(textContent));
  }

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
