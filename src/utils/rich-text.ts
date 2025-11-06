import DOMPurify from 'dompurify';
import type { Clip } from '@/types/clip';

/**
 * XSS防护：严格的HTML净化配置
 * 仅允许安全的标签和属性，移除所有脚本和事件处理器
 */
const SANITIZE_CONFIG: DOMPurify.Config = {
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

/**
 * 净化HTML内容，防止XSS攻击
 * @param html - 待净化的HTML字符串
 * @returns 净化后的安全HTML
 */
function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  try {
    return DOMPurify.sanitize(html.trim(), SANITIZE_CONFIG);
  } catch (error) {
    console.error('HTML sanitization failed:', error);
    return '';
  }
}

/**
 * 将纯文本转换为HTML，确保所有特殊字符被正确转义
 * @param text - 待转换的文本
 * @returns 转义后的HTML字符串
 */
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

/**
 * 获取剪辑的安全HTML内容（已净化）
 * @param clip - 剪辑对象
 * @returns 安全的HTML内容
 */
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
