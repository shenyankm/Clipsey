import { describe, it, expect, beforeEach } from 'vitest';
import { locateByOffset } from '@/content/highlight/locators/offset-locator';
import { computeDocumentTextData } from '@/content/highlight/metadata';
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
    const docData = computeDocumentTextData(range);
    expect(docData).not.toBeNull();

    const located = locateByOffset(docData!.offset, range.toString().length);
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
    const docData = computeDocumentTextData(range);
    expect(docData).not.toBeNull();

    const located = locateByOffset(docData!.offset, range.toString().length);
    expect(located?.toString()).toBe(range.toString());
    expect(located?.startContainer).toBe(strongText);
    expect(located?.endContainer).toBe(spanText);
  });
});
