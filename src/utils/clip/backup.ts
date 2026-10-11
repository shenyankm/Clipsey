import type { Clip } from '@/types/clip';
import { isSupportedHttpUrl } from '@/utils/helpers';

/** 备份必须完整有效；不能用迁移时的默认值修补后覆盖现有数据。 */
export function validateClipBackup(clips: unknown): asserts clips is Clip[] {
  if (!Array.isArray(clips)) throw new Error('Backup contains invalid clips');
  const ids = new Set<string>();
  const stringFields = ['title', 'htmlContent', 'highlightId', 'contextBefore', 'contextAfter', 'anchorSelector'];
  for (const clip of clips) {
    if (!clip || typeof clip !== 'object' ||
      typeof clip.id !== 'string' || !clip.id.trim() || ids.has(clip.id) ||
      typeof clip.textContent !== 'string' || !clip.textContent.trim() ||
      typeof clip.sourceUrl !== 'string' || !isSupportedHttpUrl(clip.sourceUrl) ||
      typeof clip.createdAt !== 'string' || !Number.isFinite(Date.parse(clip.createdAt)) ||
      (clip.updatedAt !== undefined && (typeof clip.updatedAt !== 'string' || !Number.isFinite(Date.parse(clip.updatedAt)))) ||
      stringFields.some(field => clip[field] !== undefined && typeof clip[field] !== 'string') ||
      (clip.textOffset !== undefined && (!Number.isSafeInteger(clip.textOffset) || clip.textOffset < 0)) ||
      (clip.highlightStyle !== undefined && clip.highlightStyle !== 'inline' && clip.highlightStyle !== 'overlay')) {
      throw new Error('Backup contains invalid records or duplicate IDs');
    }
    ids.add(clip.id);
  }
}
