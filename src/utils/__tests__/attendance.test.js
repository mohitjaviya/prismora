import { describe, it, expect } from 'vitest';
import { parseClockTime, shiftMinutes, formatDuration, shiftDuration } from '../attendance';

describe('parseClockTime', () => {
  it('reads a 12-hour time', () => {
    expect(parseClockTime('11:08 AM')).toBe(11 * 60 + 8);
    expect(parseClockTime('1:05 PM')).toBe(13 * 60 + 5);
  });

  it('puts midnight and noon on the right side of the clock', () => {
    expect(parseClockTime('12:00 AM')).toBe(0);
    expect(parseClockTime('12:30 AM')).toBe(30);
    expect(parseClockTime('12:00 PM')).toBe(12 * 60);
    expect(parseClockTime('12:45 PM')).toBe(12 * 60 + 45);
  });

  it('reads a 24-hour time, which is what a non-Indian locale writes', () => {
    expect(parseClockTime('23:08')).toBe(23 * 60 + 8);
    expect(parseClockTime('00:15')).toBe(15);
  });

  it('tolerates the punctuation and spacing browsers vary on', () => {
    expect(parseClockTime('11:08AM')).toBe(11 * 60 + 8);
    expect(parseClockTime('11:08 a.m.')).toBe(11 * 60 + 8);
    expect(parseClockTime('  11:08 PM  ')).toBe(23 * 60 + 8);
  });

  it('refuses anything that is not a time', () => {
    ['', 'Active', '—', 'half past two', '25:00', '11:70', '13:00 PM', null, undefined, 7]
      .forEach(v => expect(parseClockTime(v)).toBeNull());
  });
});

describe('shiftMinutes', () => {
  it('measures the gap the register was faking', () => {
    expect(shiftMinutes('11:08 AM', '11:09 AM')).toBe(1);
    expect(shiftMinutes('11:12 AM', '11:15 AM')).toBe(3);
  });

  it('measures a full working day', () => {
    expect(shiftMinutes('09:30 AM', '06:00 PM')).toBe(8 * 60 + 30);
  });

  it('treats an end before the start as having run past midnight', () => {
    expect(shiftMinutes('10:00 PM', '02:00 AM')).toBe(4 * 60);
  });

  it('is null when either punch is unreadable', () => {
    expect(shiftMinutes('11:08 AM', null)).toBeNull();
    expect(shiftMinutes(undefined, '11:09 AM')).toBeNull();
    expect(shiftMinutes('Active', '11:09 AM')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('writes hours and minutes only when each is there', () => {
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(1)).toBe('1m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(205)).toBe('3h 25m');
  });

  it('refuses what is not a count of minutes', () => {
    [null, undefined, -5, NaN, Infinity, '60'].forEach(v => expect(formatDuration(v)).toBeNull());
  });
});

describe('shiftDuration', () => {
  it('shows the real length of a closed shift', () => {
    expect(shiftDuration('11:08 AM', '11:09 AM')).toBe('1m');
    expect(shiftDuration('09:30 AM', '06:00 PM')).toBe('8h 30m');
  });

  it('says a shift is still running rather than guessing its length', () => {
    expect(shiftDuration('11:08 AM', null)).toBe('Active');
    expect(shiftDuration('11:08 AM', '')).toBe('Active');
  });

  it('shows nothing at all when nobody punched in', () => {
    expect(shiftDuration(null, null)).toBe('—');
    expect(shiftDuration('', '06:00 PM')).toBe('—');
  });

  it('falls back to a dash rather than printing a wrong number', () => {
    expect(shiftDuration('11:08 AM', 'whenever')).toBe('—');
  });
});
