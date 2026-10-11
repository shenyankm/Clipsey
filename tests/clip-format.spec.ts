import { expect, it } from 'vitest';
import { formatClipDateTime, getClipDateKey } from '@/utils/clip-format';

it.each([[2026, 9, 11, 1], [2026, 9, 11, 23], [2027, 0, 1, 0]])(
  'uses the same local date for grouping and display (%s, %s, %s, %s)', (year, month, day, hour) => {
    const iso = new Date(year, month, day, hour).toISOString();
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    expect(getClipDateKey(iso)).toBe(key);
    expect(formatClipDateTime(iso).slice(0, 10)).toBe(key);
  }
);
it.each([undefined, '', 'invalid'])('groups an invalid date %s as unknown', iso => {
  expect(getClipDateKey(iso)).toBe('unknown');
});
