import { describe, it, expect } from 'vitest';
import { changedFields, describeConflict, LEAD_FIELDS } from '../staleEdit';

describe('stale edit (B09)', () => {
  const base = { id: 'L11', notes: 'old note', phone: '9000000032', dealValue: 5500, productInterest: ['A', 'B'] };

  it('finds what the other person changed', () => {
    const current = { ...base, notes: 'note by the Sales Manager' };
    expect(changedFields(base, current, LEAD_FIELDS)).toEqual([
      { field: 'notes', label: 'Notes', from: 'old note', to: 'note by the Sales Manager' },
    ]);
  });

  it('ignores number formatting and empty-vs-missing', () => {
    expect(changedFields({ dealValue: 5500, email: '' }, { dealValue: '5500.00', email: null }, LEAD_FIELDS)).toEqual([]);
  });

  it('compares lists', () => {
    expect(changedFields(base, { ...base, productInterest: ['A'] }, LEAD_FIELDS)[0].label).toBe('Products');
  });

  it('writes one sentence naming the person and the change', () => {
    const text = describeConflict({ kind: 'lead', who: 'TEST Sales Manager', at: null, changes: [{ label: 'Notes', from: 'a', to: 'b' }] });
    expect(text).toBe('TEST Sales Manager saved this lead, after you opened it — Notes: "a" → "b". Overwrite it with your version, or load theirs and redo your change?');
  });
});
