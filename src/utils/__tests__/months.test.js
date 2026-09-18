import { describe, it, expect } from 'vitest';
import { MONTHS, monthKey, monthYearKey } from '../months';

describe('monthKey - the abbreviation the charts group by', () => {
  // The bug this exists to prevent: current ICU renders September as "Sept",
  // so a key built from toLocaleString never matched the 'Sep' in MONTHS and
  // every September order dropped out of the revenue trend.
  it('agrees with MONTHS for September, where the locale does not', () => {
    expect(monthKey('2026-09-17')).toBe('Sep');
    expect(monthKey('2026-09-17')).toBe(MONTHS[8]);
    expect(new Date('2026-09-17').toLocaleString('default', { month: 'short' })).not.toBe('Sep');
  });

  it('agrees with MONTHS for every month of the year', () => {
    for (let m = 0; m < 12; m += 1) {
      expect(monthKey(new Date(2026, m, 15))).toBe(MONTHS[m]);
    }
  });

  it('takes a Date or anything Date accepts', () => {
    expect(monthKey(new Date(2026, 0, 1))).toBe('Jan');
    expect(monthKey('2026-12-31T18:30:00.000Z')).toBe(monthKey(new Date('2026-12-31T18:30:00.000Z')));
  });

  it('returns null rather than a wrong month for an unusable date', () => {
    expect(monthKey('not a date')).toBeNull();
    expect(monthKey(undefined)).toBeNull();
  });
});

describe('monthYearKey', () => {
  it('carries the year, for a chart spanning more than one', () => {
    expect(monthYearKey('2026-09-17')).toBe('Sep 2026');
    expect(monthYearKey('2025-09-17')).toBe('Sep 2025');
  });

  it('returns null for an unusable date', () => {
    expect(monthYearKey('nonsense')).toBeNull();
  });
});

describe('MONTHS', () => {
  it('has twelve three-letter entries', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS.every(m => m.length === 3)).toBe(true);
  });
});
