import type { Clip } from '@/types/clip';
import { clipService } from '@/background/services/clip-service';
import { createId } from '@/utils/helpers';

export async function handleSaveClip(payload: Partial<Clip> & { textContent?: string }): Promise<void> {
  if (!payload?.textContent) {
    return;
  }

  const sourceUrl = payload.sourceUrl ?? '';
  const highlightId = typeof payload.highlightId === 'string' && payload.highlightId ? payload.highlightId : undefined;
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