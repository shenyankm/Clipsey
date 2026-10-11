import { beforeEach, describe, expect, it } from 'vitest';
import { findTextRangeInNode, normalizeWhitespace } from '@/content/highlight/text-search';

beforeEach(() => { document.body.innerHTML = ''; });

describe('text range search', () => {
  it.each([
    ['aab', 'ab'],
    ['aaab', 'aab'],
    ['abababac', 'ababac'],
    ['Hello WORLD', 'hello world'],
    ['İstanbul', 'istanbul'.replace('i', 'i\u0307')]
  ])('finds overlapping prefixes and case-insensitive text in %s', (text, query) => {
    document.body.textContent = text;
    const range = findTextRangeInNode(document.body, query);
    expect(range).not.toBeNull();
    expect(range?.toString().toLowerCase()).toBe(query.toLowerCase());
  });

  it('preserves whitespace-only nodes between inline elements', () => {
    document.body.innerHTML = '<span>Hello</span> \n <strong>World</strong>';
    const range = findTextRangeInNode(document.body, 'Hello World');
    expect(normalizeWhitespace(range!.toString())).toBe('Hello World');
    expect(range?.startContainer).toBe(document.querySelector('span')?.firstChild);
    expect(range?.endContainer).toBe(document.querySelector('strong')?.firstChild);
  });

  it('skips already-highlighted matches without matching across them', () => {
    document.body.innerHTML = 'a<span data-clipsey-id="old">x</span>b ab';
    expect(findTextRangeInNode(document.body, 'ab')?.toString()).toBe('ab');
    expect(findTextRangeInNode(document.body, 'axb')).toBeNull();
    expect(findTextRangeInNode(document.body, 'axb', false)?.toString()).toBe('axb');
  });

  it('ignores scripts and rejects empty or missing text', () => {
    document.body.innerHTML = '<script>target</script><p>visible</p>';
    expect(findTextRangeInNode(document.body, 'target')).toBeNull();
    expect(findTextRangeInNode(document.body, ' ')).toBeNull();
    expect(findTextRangeInNode(document.body, 'missing')).toBeNull();
  });
});
