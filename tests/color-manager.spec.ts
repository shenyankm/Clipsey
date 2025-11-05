import { describe, it, expect } from 'vitest';
import { ensureHighlightColorsReady, updateCachedOptions } from '@/content/color-manager';

describe('ColorManager', () => {
  it('injects CSS variables and classes on init', async () => {
    document.head.innerHTML = '';
    await ensureHighlightColorsReady();
    const styles = Array.from(document.head.querySelectorAll('style'));
    const text = styles.map(s => s.textContent || '').join('\n');
    expect(text).toMatch('--clipsey-inline-highlight-color');
    expect(text).toMatch('--clipsey-overlay-highlight-color');
    expect(text).toMatch('.clipsey-inline-highlight');
    expect(text).toMatch('.clipsey-overlay-highlight');
  });

  it('updates CSS variables when options change', async () => {
    await ensureHighlightColorsReady();
    updateCachedOptions({ highlightColor: '#00ff00' });
    const rootStyle = getComputedStyle(document.documentElement);
    const inline = rootStyle.getPropertyValue('--clipsey-inline-highlight-color');
    const overlay = rootStyle.getPropertyValue('--clipsey-overlay-highlight-color');
    expect(inline.trim()).toMatch(/rgba\(0, 255, 0, 0\.45\)/);
    expect(overlay.trim()).toMatch(/rgba\(0, 255, 0, 0\.3(0)?\)/);
  });
});