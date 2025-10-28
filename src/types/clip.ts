export interface Clip {
  id: string;
  sourceUrl: string;
  title?: string;
  textContent: string;
  htmlContent?: string;
  createdAt: string;
  highlightId?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
}
