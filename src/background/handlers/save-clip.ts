import type { Clip } from '@/types/clip';
import { clipService } from '@/background/services/clip-service';
import { createId, isSupportedHttpUrl } from '@/utils/helpers';
import type { SaveClipPayload } from '@/types/message';

export async function handleSaveClip(payload: SaveClipPayload): Promise<void> {
  // 验证必填字段
  if (!payload?.textContent || typeof payload.textContent !== 'string') {
    throw new Error('缺少必需的 textContent 字段');
  }

  if (payload.textContent.trim().length === 0) {
    throw new Error('textContent 不能为空');
  }

  if (payload.textContent.length > 50000) {  // 50KB 限制
    throw new Error('textContent 超过最大长度限制');
  }

  const sourceUrl = payload.sourceUrl ?? '';
  if (!sourceUrl) {
    throw new Error('缺少必需的 sourceUrl 字段');
  }

  // 区域限制：仅允许在 http/https 普通网页上保存摘抄
  if (!isSupportedHttpUrl(sourceUrl)) {
    throw new Error('当前页面不支持摘抄，仅支持在第三方网站的 http/https 页面使用。');
  }

  // 验证 highlightId 格式
  const highlightId = typeof payload.highlightId === 'string' && payload.highlightId.trim()
    ? payload.highlightId.trim()
    : undefined;
  
  // 验证 htmlContent 大小
  if (payload.htmlContent && payload.htmlContent.length > 100000) {  // 100KB 限制
    throw new Error('htmlContent 超过最大长度限制');
  }

  // 验证 textOffset
  if (payload.textOffset !== undefined) {
    if (!Number.isFinite(payload.textOffset) || payload.textOffset < 0) {
      throw new Error('textOffset 必须是非负数');
    }
  }

  const existingForUrl = highlightId ? await clipService.listByUrl(sourceUrl) : [];
  const existingClip = highlightId
    ? existingForUrl.find(clip => clip.highlightId === highlightId)
    : undefined;

  const clip: Clip = {
    id: createId(),
    sourceUrl,
    title: payload.title,
    textContent: payload.textContent,
    htmlContent: payload.htmlContent,
    createdAt: existingClip?.createdAt ?? new Date().toISOString(),
    highlightId,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    anchorSelector: payload.anchorSelector,
    textOffset: typeof payload.textOffset === 'number' && Number.isFinite(payload.textOffset)
      ? payload.textOffset
      : existingClip?.textOffset,
    highlightStyle: payload.highlightStyle ?? existingClip?.highlightStyle ?? 'inline'
  };

  await clipService.add(clip);
}