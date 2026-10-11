import { describe, it, expect, beforeEach } from 'vitest';
import { locateByOffset, locateByOffsets } from '@/content/highlight/locators/offset-locator';
import { captureHighlightMetadata } from '@/content/highlight/metadata';
import { LocationStrategy } from '@/content/highlight/locators';

describe('locateByOffset', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <article>
        <p>前导段落。</p>
        <p><strong>目标段落</strong>与<span>跨节点</span>内容。</p>
      </article>
    `;
  });

  it('falls back to matching text when a saved offset points to changed content', () => {
    document.body.innerHTML = '<p>NEW prefix target suffix</p>';
    expect(LocationStrategy.locate({ text: 'target', textOffset: 7, anchorSelector: 'p' })?.toString()).toBe('target');
  });

  it('does not highlight unrelated text when the quote has disappeared', () => {
    document.body.innerHTML = '<p>prefix different suffix</p>';
    expect(LocationStrategy.locate({ text: 'target', textOffset: 7 })).toBeNull();
  });

  it.each([-1, NaN, Infinity, 1.5])('ignores an invalid offset %s and searches for the quote', textOffset => {
    document.body.innerHTML = '<p>prefix target suffix</p>';
    expect(LocationStrategy.locate({ text: 'target', textOffset })?.toString()).toBe('target');
  });

  it('偏移位于单个节点内部时，应返回非折叠 Range', () => {
    const strongText = document.querySelector('strong')?.firstChild as Text;
    expect(strongText).toBeTruthy();

    const range = document.createRange();
    range.setStart(strongText, 0);
    range.setEnd(strongText, strongText.textContent?.length ?? 0);
    const docData = captureHighlightMetadata(range, null, 'fixture');
    expect(docData).not.toBeNull();

    const located = locateByOffset(docData!.textOffset!, range.toString().length);
    expect(located?.toString()).toBe(range.toString());
    expect(located?.startContainer).toBe(strongText);
    expect(located?.collapsed).toBe(false);
  });

  it('偏移跨越多个节点时，应返回完整 Range', () => {
    const strongText = document.querySelector('strong')?.firstChild as Text;
    const spanText = document.querySelector('span')?.firstChild as Text;
    expect(strongText).toBeTruthy();
    expect(spanText).toBeTruthy();

    const range = document.createRange();
    range.setStart(strongText, 0);
    range.setEnd(spanText, spanText.textContent?.length ?? 0);
    const docData = captureHighlightMetadata(range, null, 'fixture');
    expect(docData).not.toBeNull();

    const located = locateByOffset(docData!.textOffset!, range.toString().length);
    expect(located?.toString()).toBe(range.toString());
    expect(located?.startContainer).toBe(strongText);
    expect(located?.endContainer).toBe(spanText);
  });

  it('maps unsorted, duplicate and adjacent boundaries with one traversal', () => {
    document.body.innerHTML = '<p>abc<b>def</b>ghi</p><div style="display:none">HIDE</div><p>JK</p>';
    const p = document.querySelector('p')!;
    const texts = [p.firstChild!, p.querySelector('b')!.firstChild!, p.lastChild!, document.querySelectorAll('p')[1]!.firstChild!] as Text[];
    const targets = Array.from({ length: 12 }, (_, offset) =>
      Array.from({ length: 12 }, (_, length) => ({ offset, length: length + 1 }))
    ).flat().reverse();
    targets.push({ offset: 3, length: 3 }, { offset: 2, length: 1 });
    const ranges = locateByOffsets(targets);
    targets.forEach(({ offset, length }, index) => {
      const range = ranges[index];
      if (offset >= 11) { expect(range).toBeNull(); return; }
      let position = 0;
      const start = texts.find(node => { const end = position + node.length; if (offset < end) return true; position = end; return false; })!;
      expect(range?.startContainer).toBe(start);
      expect(range?.startOffset).toBe(offset - position);
      const endOffset = Math.min(11, offset + length);
      position = 0;
      const end = texts.find(node => { const next = position + node.length; if (endOffset <= next) return true; position = next; return false; })!;
      expect(range?.endContainer).toBe(end);
      expect(range?.endOffset).toBe(endOffset - position);
    });
  });

  it('retains single-offset normalization and stops before an unneeded tail', () => {
    document.body.innerHTML = '<p>abcdef</p><p>unneeded</p>';
    expect(locateByOffset(NaN, Infinity)?.toString()).toBe('a');
    expect(locateByOffset(-10, 1.5)?.toString()).toBe('a');
    expect(locateByOffset(1.8, 2.9)?.toString()).toBe('bc');
    expect(locateByOffsets([])).toEqual([]);
    const tail = document.querySelectorAll('p')[1]!;
    Object.defineProperty(tail.firstChild!, 'textContent', { get() { throw new Error('Tail must not be visited'); } });
    expect(locateByOffsets([{ offset: 0, length: 3 }, { offset: 3, length: 3 }]).map(range => range?.toString())).toEqual(['abc', 'def']);
  });
});
