import { beforeEach, expect, it, vi } from 'vitest';
import { captureHighlightMetadata } from '@/content/highlight/metadata';
import { createTextNodeWalker } from '@/content/highlight/dom-utils';
import { locateByOffset } from '@/content/highlight/locators/offset-locator';
import { LocationStrategy } from '@/content/highlight/locators';

beforeEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

function fullDocumentContext(range: Range) {
  const walker = createTextNodeWalker()!;
  let text = '', offset: number | undefined;
  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) offset = text.length + range.startOffset;
    text += node.textContent;
    node = walker.nextNode();
  }
  if (offset === undefined) return { textOffset: undefined, contextBefore: undefined, contextAfter: undefined };
  const selected = range.toString();
  offset += selected.length - selected.trimStart().length;
  return {
    textOffset: offset,
    contextBefore: text.slice(Math.max(0, offset - 64), offset),
    contextAfter: text.slice(offset + selected.trim().length, offset + selected.trim().length + 64)
  };
}

it.each([
  '<p id="start">prefix  target  suffix</p>',
  `<p>${'α😀'.repeat(40)}</p><p><b id="start">  tar</b><i id="end">get  </i> suffix</p><p>${'x'.repeat(200)}</p>`,
  '<p id="start">prefix  </p><p>   </p><b id="end">target</b>',
  '<p id="start">prefix </p><div style="display:none">hidden</div><b id="end">target</b><script>ignored</script>',
  `<p id="start">prefix </p><p>${' '.repeat(100)}</p>`,
  `<p>${'before '.repeat(50)}</p><p id="start">near the end</p>`
])('preserves the full-document context formula without assembling all text: %s', html => {
  document.body.innerHTML = html;
  const start = document.querySelector('#start')!.firstChild as Text;
  const end = (document.querySelector('#end')?.firstChild as Text) ?? start;
  for (const startOffset of [0, Math.min(7, start.length), start.length]) {
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, end.length);
    expect(captureHighlightMetadata(range, null, 'fixture')).toMatchObject(fullDocumentContext(range));
  }
});

it('stops visiting the tail once the following 64 characters have been captured', () => {
  document.body.innerHTML = '<p id="start">target</p>' + '<p>following text with enough characters</p>'.repeat(100);
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#start')!.firstChild!);
  const expected = fullDocumentContext(range);
  const styles = vi.spyOn(window, 'getComputedStyle');
  expect(captureHighlightMetadata(range, null, 'fixture')).toMatchObject(expected);
  expect(styles).toHaveBeenCalledTimes(5);
});

it('avoids scanning for element boundaries or detached text that cannot provide an offset', () => {
  document.body.innerHTML = '<p>visible</p>';
  const styles = vi.spyOn(window, 'getComputedStyle');
  for (const start of [document.querySelector('p')!, document.createTextNode('detached')]) {
    const range = document.createRange();
    range.selectNodeContents(start);
    expect(captureHighlightMetadata(range, null, 'fixture')).toMatchObject({ textOffset: undefined, contextBefore: undefined, contextAfter: undefined });
  }
  expect(styles).not.toHaveBeenCalled();
  expect(captureHighlightMetadata(null, null, 'fixture')).toBeNull();
});

it('checks a fragmented parent once per walker and sees changed styles on the next walk', () => {
  const p = document.createElement('p');
  p.append('one', 'two', 'three');
  document.body.append(p);
  const styles = vi.spyOn(window, 'getComputedStyle');
  let walker = createTextNodeWalker()!;
  expect([walker.nextNode()?.textContent, walker.nextNode()?.textContent, walker.nextNode()?.textContent]).toEqual(['one', 'two', 'three']);
  expect(styles).toHaveBeenCalledTimes(3);
  p.style.display = 'none';
  walker = createTextNodeWalker()!;
  expect(walker.nextNode()).toBeNull();
  expect(styles).toHaveBeenCalledTimes(6);
});

it('retries a style read after a transient failure and keeps excluded elements filtered', () => {
  const p = document.createElement('p');
  p.style.display = 'none';
  p.append('first', 'second', 'third');
  document.body.append(p);
  const read = window.getComputedStyle;
  const styles = vi.spyOn(window, 'getComputedStyle').mockImplementationOnce(() => { throw new Error('Transient'); }).mockImplementation(read);
  const walker = createTextNodeWalker()!;
  expect(walker.nextNode()?.textContent).toBe('first');
  expect(walker.nextNode()).toBeNull();
  expect(styles).toHaveBeenCalledTimes(4);
  document.body.innerHTML = '<script>secret</script><style>body{}</style><svg><text>svg</text></svg><canvas>canvas</canvas><p>visible</p>';
  expect(createTextNodeWalker()!.nextNode()?.textContent).toBe('visible');
});

it('excludes nested hidden text from offsets and restores records with older offsets', () => {
  document.body.innerHTML = '<div style="display:none"><b>hidden prefix </b></div><p>before <span id="target">target</span> after</p>';
  const text = document.querySelector('#target')!.firstChild!;
  const range = document.createRange();
  range.selectNodeContents(text);
  expect(captureHighlightMetadata(range, null, 'visible')).toMatchObject({ textOffset: 7, contextBefore: 'before ', contextAfter: ' after' });
  expect(locateByOffset(7, 6)?.startContainer).toBe(text);
  expect(LocationStrategy.locate({ text: 'target', textOffset: 21 })?.startContainer).toBe(text);
});

it('does not read the style of every descendant of a hidden ancestor', () => {
  document.body.innerHTML = '<div style="display:none">' + '<p>prefix <b>quote</b> tail</p>'.repeat(100) + '</div><p>visible</p>';
  const styles = vi.spyOn(window, 'getComputedStyle');
  const walker = createTextNodeWalker()!;
  expect(walker.nextNode()?.textContent).toBe('visible');
  expect(walker.nextNode()).toBeNull();
  expect(styles).toHaveBeenCalledTimes(4);
});
