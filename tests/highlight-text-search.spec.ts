import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findTextRangeInNode, normalizeWhitespace } from '@/content/highlight/text-search';

beforeEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('text range search', () => {
  it('preserves range boundaries through every Latin-1 code unit and whitespace run', () => {
    for (let code = 0; code <= 0xff; code++) {
      const prefix = document.createTextNode('prefix' + String.fromCharCode(code).repeat(3));
      const target = document.createElement('b'); target.textContent = 'TARGET!';
      document.body.replaceChildren(prefix, target);
      const full = findTextRangeInNode(document.body, normalizeWhitespace(document.body.textContent!).toLowerCase());
      expect(full?.startContainer, `full start at ${code}`).toBe(prefix);
      expect(full?.startOffset).toBe(0);
      expect(full?.endContainer).toBe(target.firstChild);
      expect(full?.endOffset, `full end at ${code}`).toBe(7);
      const tail = findTextRangeInNode(document.body, 'target!');
      expect(tail?.startContainer, `tail start at ${code}`).toBe(target.firstChild);
      expect(tail?.startOffset).toBe(0);
      expect(tail?.endOffset).toBe(7);
    }
  });

  it.each(['\u1680', '\u2000', '\u2003', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff', '中文', 'İ', 'ΣΟΣ', '𐐀', '🙂'])('preserves the non-Latin-1 path around %s', prefix => {
    const before = document.createTextNode('前文 ' + prefix.repeat(3));
    const target = document.createElement('b'); target.textContent = 'İSTANBUL\u2003\u3000中文🙂';
    document.body.replaceChildren(before, target);
    const range = findTextRangeInNode(document.body, 'i\u0307stanbul 中文🙂');
    expect(range?.toString()).toBe(target.textContent);
    expect(range?.startContainer).toBe(target.firstChild);
    expect(range?.startOffset).toBe(0);
    expect(range?.endOffset).toBe(target.textContent.length);
  });

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

  it('ignores hidden ancestors outside custom element and text roots', () => {
    document.body.innerHTML = '<div style="display:none"><span id="hidden">target</span></div><p id="visible">target</p>';
    const hidden = document.querySelector('#hidden')!;
    expect(findTextRangeInNode(document.body, 'target')?.startContainer).toBe(document.querySelector('#visible')!.firstChild);
    expect(findTextRangeInNode(hidden, 'target')).toBeNull();
    expect(findTextRangeInNode(hidden.firstChild!, 'target')).toBeNull();
    (hidden.parentElement as HTMLElement).style.display = 'block';
    expect(findTextRangeInNode(hidden.firstChild!, 'target')?.toString()).toBe('target');
  });

  it('keeps visible overrides and text under display:contents', () => {
    document.body.innerHTML = '<div style="visibility:hidden"><span style="visibility:visible;display:contents">target</span></div>';
    expect(findTextRangeInNode(document.body, 'target')?.toString()).toBe('target');
  });

  it('rejects excluded ancestors outside the root even when styles cannot be read', () => {
    document.body.innerHTML = '<svg><text id="excluded">target</text></svg><p>visible</p>';
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => { throw new Error('Unavailable'); });
    const excluded = document.querySelector('#excluded')!;
    expect(findTextRangeInNode(excluded, 'target')).toBeNull();
    expect(findTextRangeInNode(excluded.firstChild!, 'target')).toBeNull();
  });

  it('maps late matches across whitespace and case-expansion boundaries', () => {
    document.body.innerHTML = '<p>prefix \t\n <span>İ</span><b>STANBUL</b> \r\n <i>🙂</i>  suffix</p>';
    const range = findTextRangeInNode(document.body, 'i\u0307stanbul 🙂');
    expect(normalizeWhitespace(range!.toString()).toLowerCase()).toBe('i\u0307stanbul 🙂');
    expect(range?.startContainer).toBe(document.querySelector('span')?.firstChild);
    expect(range?.startOffset).toBe(0);
    expect(range?.endContainer).toBe(document.querySelector('i')?.firstChild);
    expect(range?.endOffset).toBe(2);
  });

  it('maps a later overlapping match after skipping an already highlighted one', () => {
    document.body.innerHTML = '<span data-clipsey-id="first">aab</span><b> a</b><i>ab</i>';
    const range = findTextRangeInNode(document.body, 'ab');
    expect(range?.toString()).toBe('ab');
    expect(range?.startContainer).toBe(document.querySelector('i')?.firstChild);
    expect(range?.startOffset).toBe(0);
    expect(range?.endOffset).toBe(2);
  });
});
