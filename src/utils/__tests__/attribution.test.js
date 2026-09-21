import { describe, it, expect } from 'vitest';
import { recordedById, isAutomatic, personName, attributionFor, stampCreator } from '../attribution';

const USERS = [
  { id: 'U1', name: 'Mohit Javiya' },
  { id: 'U2', name: 'Surbhi Patel' },
];

describe('recordedById', () => {
  it('reads whichever column the table happens to use', () => {
    // Four tables say recordedBy, grn says receivedBy, 031 adds createdBy.
    // Renaming them all to agree would be a migration with nothing to show.
    expect(recordedById({ createdBy: 'U1' })).toBe('U1');
    expect(recordedById({ recordedBy: 'U2' })).toBe('U2');
    expect(recordedById({ receivedBy: 'U2' })).toBe('U2');
  });

  it('prefers createdBy, which is the one being written now', () => {
    expect(recordedById({ createdBy: 'U1', recordedBy: 'U2' })).toBe('U1');
  });

  it('never credits assignedTo', () => {
    // On an expense that is who the money is for; on a purchase order it is
    // who owns the order. Neither is who typed it in, and showing one as the
    // other puts the wrong name beside somebody else's mistake.
    expect(recordedById({ assignedTo: 'U1' })).toBeNull();
  });

  it('is nothing when there is nothing', () => {
    expect(recordedById({ createdBy: '  ' })).toBeNull();
    expect(recordedById({})).toBeNull();
    expect(recordedById(null)).toBeNull();
  });
});

describe('isAutomatic', () => {
  it('knows the expenses the system books for itself', () => {
    // Settling a claim, paying an incentive and approving a field expense each
    // write a row with a derived id, and no person typed any of them.
    expect(isAutomatic({ id: 'EXP-INC-4' })).toBe(true);
    expect(isAutomatic({ id: 'EXP-CLM-2' })).toBe(true);
    expect(isAutomatic({ id: 'EXP-FLD-9' })).toBe(true);
  });

  it('leaves an ordinary expense alone', () => {
    expect(isAutomatic({ id: 'EXP-12' })).toBe(false);
    expect(isAutomatic({ id: 'PO-3' })).toBe(false);
    expect(isAutomatic({})).toBe(false);
  });
});

describe('personName', () => {
  it('turns an id into a name', () => {
    expect(personName(USERS, 'U2')).toBe('Surbhi Patel');
  });

  it('shows an unmatched id rather than "Unknown"', () => {
    // The account has usually been deleted, and the id is the only thread left
    // back to who it was.
    expect(personName(USERS, 'U99')).toBe('U99');
  });

  it('copes with no list and no id', () => {
    expect(personName([], 'U1')).toBe('U1');
    expect(personName(USERS, '')).toBe('');
    expect(personName(undefined, undefined)).toBe('');
  });
});

describe('attributionFor', () => {
  it('names the person who entered it', () => {
    expect(attributionFor({ id: 'EXP-12', createdBy: 'U1' }, USERS))
      .toEqual({ name: 'Mohit Javiya', id: 'U1', automatic: false });
  });

  it('says so for a row the system booked', () => {
    const r = attributionFor({ id: 'EXP-INC-4', createdBy: null }, USERS);
    expect(r.automatic).toBe(true);
    expect(r.name).toMatch(/automatically/i);
  });

  it('calls an automatic row automatic even if something stamped it', () => {
    // reconcilePayouts runs as whoever pressed the button, and crediting them
    // with entering forty expenses would be wrong.
    expect(attributionFor({ id: 'EXP-CLM-2', createdBy: 'U1' }, USERS).automatic).toBe(true);
  });

  it('distinguishes "nobody recorded it" from an em dash', () => {
    // Everything written before 031 has no creator, and saying so is more use
    // than a blank, which reads as a value somebody failed to enter.
    const r = attributionFor({ id: 'EXP-3' }, USERS);
    expect(r.name).toBe('Not recorded');
    expect(r.automatic).toBe(false);
  });

  it('always gives something printable', () => {
    [null, undefined, {}, { id: 'X' }].forEach(record => {
      expect(typeof attributionFor(record, USERS).name).toBe('string');
      expect(attributionFor(record, USERS).name.length).toBeGreaterThan(0);
    });
  });
});

describe('stampCreator', () => {
  it('records who is entering it', () => {
    expect(stampCreator({ amount: 500 }, 'U1')).toEqual({ amount: 500, createdBy: 'U1' });
  });

  it('never overwrites what the form already said', () => {
    // A goods receipt names the person at the gate, who is not always the
    // person at the keyboard.
    expect(stampCreator({ receivedBy: 'U2' }, 'U1')).toEqual({ receivedBy: 'U2' });
    expect(stampCreator({ recordedBy: 'U2' }, 'U1')).toEqual({ recordedBy: 'U2' });
  });

  it('does nothing without somebody to credit', () => {
    expect(stampCreator({ amount: 1 }, null)).toEqual({ amount: 1 });
    expect(stampCreator({ amount: 1 }, '  ')).toEqual({ amount: 1 });
  });

  it('does not modify the row it was given', () => {
    const row = { amount: 500 };
    stampCreator(row, 'U1');
    expect(row).toEqual({ amount: 500 });
  });
});
