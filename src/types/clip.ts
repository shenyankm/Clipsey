export interface Clip {
  id: string;
  sourceUrl: string;
  title?: string;
  textContent: string;
  htmlContent?: string;
  createdAt: string;
  updatedAt?: string; // ISO string timestamp for tracking updates
  highlightId?: string;
  contextBefore?: string;
  contextAfter?: string;
  anchorSelector?: string;
  textOffset?: number;
  highlightStyle?: 'inline' | 'overlay';
}
