import { describe, it, expect } from 'vitest';
import { indiaDay, inIndiaDayRange } from '../orderDate';

describe('indiaDay - the day as India sees it', () => {
  it('puts 00:30 IST on 3 Oct on 3 Oct, not the UTC 2 Oct', () => {
    expect(indiaDay(new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-03');
  });
  it('keeps late evening IST on the same day', () => {
    expect(indiaDay(new Date('2026-10-03T18:00:00Z'))).toBe('2026-10-03');
  });
  it('says nothing for a bad date', () => {
    expect(indiaDay('nope')).toBe('');
  });
});

describe('inIndiaDayRange - report from/to days, whole and India time', () => {
  it('includes 00:00-05:30 IST of the "from" day (carry-over finding 1)', () => {
    expect(inIndiaDayRange('2026-09-28T18:31:00Z', '2026-09-29', '')).toBe(true);   // 00:01 IST 29 Sep
    expect(inIndiaDayRange('2026-09-28T23:59:00Z', '2026-09-29', '')).toBe(true);   // 05:29 IST 29 Sep
  });
  it('leaves out the evening before the "from" day', () => {
    expect(inIndiaDayRange('2026-09-28T18:29:00Z', '2026-09-29', '')).toBe(false);  // 23:59 IST 28 Sep
  });
  it('includes the whole "to" day and nothing after', () => {
    expect(inIndiaDayRange('2026-09-29T18:29:59Z', '', '2026-09-29')).toBe(true);   // 23:59:59 IST
    expect(inIndiaDayRange('2026-09-29T18:30:00Z', '', '2026-09-29')).toBe(false);  // 00:00 IST 30 Sep
  });
  it('lets everything through with no range', () => {
    expect(inIndiaDayRange('2020-01-01', '', '')).toBe(true);
  });
});
