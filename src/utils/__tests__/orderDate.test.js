import { describe, it, expect } from 'vitest';
import { localDay, orderDateToSave } from '../orderDate';

describe('order date', () => {
  const raised = new Date(2026, 8, 28, 10, 15, 30).toISOString();   // 28 Sep, 10:15 local
  const now = new Date(2026, 8, 28, 16, 5, 0);                       // saved at 16:05 local

  it('keeps the exact moment when the day is not changed (edits, deliveries)', () => {
    expect(orderDateToSave('2026-09-28', raised, now)).toBe(raised);
  });

  it('never turns a day into midnight', () => {
    const saved = new Date(orderDateToSave('2026-09-28', null, now));
    expect([saved.getHours(), saved.getMinutes()]).toEqual([16, 5]);
  });

  it('moves to the chosen day, at the time of saving, when the day is changed', () => {
    const saved = new Date(orderDateToSave('2026-09-25', raised, now));
    expect(localDay(saved)).toBe('2026-09-25');
    expect(saved.getHours()).toBe(16);
  });

  it('reads the day in local time', () => {
    expect(localDay(new Date(2026, 8, 28, 0, 30))).toBe('2026-09-28');
    expect(localDay('not a date')).toBe('');
  });

  it('sorts a same-day edited order by when it happened, not first thing that day', () => {
    const morning = new Date(2026, 8, 28, 9, 0).toISOString();
    const editedLater = orderDateToSave('2026-09-28', null, now);
    expect(new Date(editedLater) > new Date(morning)).toBe(true);
  });
});
