import type { Clip } from '@/types/clip';
import { hashString } from '../utils/hash';

const MAX_CLIP_ENTRIES = 200;

/** 标准化剪辑数据：去重、验证必填字段、限制数量。 */
export function normalizeClips(clips: Clip[]): Clip[] {
  const limited = clips.slice(0, MAX_CLIP_ENTRIES);
  const normalized: Clip[] = [];
  const seen = new Set<string>();
  
  for (const clip of limited) {
    if (!clip || typeof clip !== 'object') {
      continue;
    }

    const id = typeof clip.id === 'string' && clip.id ? clip.id : createFallbackId(clip);
    if (seen.has(id)) {
      continue;
    }

    const textContent = typeof clip.textContent === 'string' ? clip.textContent : '';
    if (!textContent) {
      continue;
    }

    const highlightId =
      typeof clip.highlightId === 'string' && clip.highlightId ? clip.highlightId : undefined;
    const contextBefore =
      typeof clip.contextBefore === 'string' ? clip.contextBefore : undefined;
    const contextAfter =
      typeof clip.contextAfter === 'string' ? clip.contextAfter : undefined;
    const anchorSelector =
      typeof clip.anchorSelector === 'string' ? clip.anchorSelector : undefined;
    const textOffset =
      typeof clip.textOffset === 'number' && Number.isFinite(clip.textOffset)
        ? clip.textOffset
        : undefined;
    const highlightStyle =
      clip.highlightStyle === 'inline' || clip.highlightStyle === 'overlay'
        ? clip.highlightStyle
        : highlightId
          ? 'inline'
          : undefined;

    const now = Date.now();
    normalized.push({
      id,
      sourceUrl: typeof clip.sourceUrl === 'string' ? clip.sourceUrl : '',
      title: typeof clip.title === 'string' ? clip.title : undefined,
      textContent,
      htmlContent: typeof clip.htmlContent === 'string' ? clip.htmlContent : undefined,
      createdAt: typeof clip.createdAt === 'string' ? clip.createdAt : new Date().toISOString(),
      updatedAt: new Date(now).toISOString(),
      highlightId,
      contextBefore,
      contextAfter,
      anchorSelector,
      textOffset,
      highlightStyle
    });
    seen.add(id);
  }

  return normalized;
}

/** 创建备用 ID。 */
function createFallbackId(clip: Clip): string {
  if (clip.highlightId) {
    return clip.highlightId;
  }
  if (clip.textContent) {
    return `clip-${hashString(clip.textContent)}`;
  }
  return `clip-${Date.now()}`;
}
