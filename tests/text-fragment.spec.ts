import { describe, expect, it } from 'vitest';
import { createTextFragmentUrl, stripTextFragment } from '@/utils/clip/text-fragment';
import type { Clip } from '@/types/clip';

const clip = (sourceUrl: string, textContent: string): Clip => ({
  id: 'clip', sourceUrl, textContent, createdAt: '2025-01-01'
});

describe('native text fragment URLs', () => {
  it('preserves query parameters and existing anchors', () => {
    expect(createTextFragmentUrl(clip('https://example.com/article?page=2#section', 'hello world')))
      .toBe('https://example.com/article?page=2#section:~:text=hello%20world');
  });

  it('encodes Chinese, punctuation and directive delimiters', () => {
    const text = '中文 a-b, c&d #?%';
    const url = new URL(createTextFragmentUrl(clip('https://example.com', text)));
    expect(url.hash).toContain('a%2Db%2C');
    expect(decodeURIComponent(url.hash.split('text=')[1])).toBe(text);
    expect(url.hash).not.toContain('&');
  });

  it('replaces old text directives instead of appending another one', () => {
    expect(createTextFragmentUrl(clip('https://example.com/#section:~:text=old', 'new')))
      .toBe('https://example.com/#section:~:text=new');
  });

  it('uses a range for multi-paragraph selections and normalizes whitespace', () => {
    expect(createTextFragmentUrl(clip('https://example.com', ' First   paragraph\n\nLast paragraph ')))
      .toBe('https://example.com/#:~:text=First%20paragraph,Last%20paragraph');
  });

  it('removes only the directive when resolving a page source', () => {
    expect(stripTextFragment('https://example.com/#:~:text=hello')).toBe('https://example.com/');
    expect(stripTextFragment('https://example.com/article?page=2#section:~:text=hello'))
      .toBe('https://example.com/article?page=2#section');
    expect(stripTextFragment('https://example.com/article#section')).toBe('https://example.com/article#section');
  });

  it('does not add a directive for empty text and rejects unsafe URLs', () => {
    expect(createTextFragmentUrl(clip('https://example.com/#anchor', ' '))).toBe('https://example.com/#anchor');
    expect(() => createTextFragmentUrl(clip('javascript:alert(1)', 'text'))).toThrow('Unsupported');
  });
});
