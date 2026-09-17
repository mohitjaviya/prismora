import { describe, it, expect } from 'vitest';
import { MASTER_LISTS, listById, optionsFor, keysFor, labelForKey } from '../masterLists';

const rows = (...rs) => rs;
const row = (list, key, label, extra = {}) => ({
  id: `M-${list}-${key}`, list, key, label, sort: 0, active: true, locked: false, ...extra,
});

describe('the list definitions themselves', () => {
  it('gives every list a unique id', () => {
    const ids = MASTER_LISTS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every option of a workflow list as locked, and none of a free list', () => {
    for (const list of MASTER_LISTS) {
      const locks = list.defaults.map(d => d.locked);
      expect(locks.every(l => l === list.locked)).toBe(true);
    }
  });

  it('starts every default with its label equal to its key', () => {
    for (const list of MASTER_LISTS) {
      for (const d of list.defaults) expect(d.label).toBe(d.key);
    }
  });

  // The whole safety argument rests on these keys still being the strings the
  // code compares against. If one is edited here, the workflow it drives breaks.
  it('keeps the keys the application branches on', () => {
    expect(keysFor([], 'order_status')).toContain('Delivered');
    expect(keysFor([], 'order_status')).toContain('Ready for Dispatch');
    expect(keysFor([], 'order_status')).toContain('Shipped');
    expect(keysFor([], 'po_status')).toContain('GRN Done');
    expect(keysFor([], 'lead_status')).toContain('First Order');
    expect(keysFor([], 'lead_status')).toContain('Active');
  });

  it('finds a list by id, and returns null for one that does not exist', () => {
    expect(listById('lead_source').name).toBe('Lead Sources');
    expect(listById('nope')).toBeNull();
  });
});

describe('optionsFor — falling back rather than emptying a dropdown', () => {
  it('uses the built-in defaults when nothing is stored', () => {
    expect(optionsFor([], 'uom').map(o => o.key)).toEqual(['BOX', 'BOTTLE', 'TUBE', 'STRIP', 'PIECE', 'KG']);
  });

  it('uses the defaults when the whole table is unreachable', () => {
    expect(optionsFor(null, 'uom').length).toBe(6);
    expect(optionsFor(undefined, 'uom').length).toBe(6);
  });

  it('returns nothing for a list it has never heard of', () => {
    expect(optionsFor([], 'invented')).toEqual([]);
  });

  it('prefers stored rows over the defaults once there are any', () => {
    const stored = rows(row('uom', 'CARTON', 'Carton'));
    expect(optionsFor(stored, 'uom').map(o => o.key)).toEqual(['CARTON']);
  });

  it('ignores rows belonging to other lists', () => {
    const stored = rows(row('uom', 'CARTON', 'Carton'), row('warehouse', 'Depot', 'Depot'));
    expect(optionsFor(stored, 'uom').map(o => o.key)).toEqual(['CARTON']);
  });

  it('leaves switched-off options out of dropdowns but shows them when asked', () => {
    const stored = rows(
      row('uom', 'BOX', 'Box'),
      row('uom', 'TUBE', 'Tube', { active: false }),
    );
    expect(optionsFor(stored, 'uom').map(o => o.key)).toEqual(['BOX']);
    expect(optionsFor(stored, 'uom', { includeInactive: true }).map(o => o.key)).toEqual(['BOX', 'TUBE']);
  });

  it('orders by sort, then by label when two share a position', () => {
    const stored = rows(
      row('uom', 'C', 'C', { sort: 2 }),
      row('uom', 'A', 'A', { sort: 1 }),
      row('uom', 'B', 'B', { sort: 1 }),
    );
    expect(optionsFor(stored, 'uom').map(o => o.key)).toEqual(['A', 'B', 'C']);
  });
});

describe('labelForKey — what a stored value should read as', () => {
  it('returns the label a key has been renamed to', () => {
    const stored = rows(row('order_status', 'Delivered', 'Order Completed', { locked: true }));
    expect(labelForKey(stored, 'order_status', 'Delivered')).toBe('Order Completed');
  });

  // A record written before an option was removed still has to read sensibly.
  it('falls back to the key itself when the option is gone', () => {
    expect(labelForKey([], 'order_status', 'Some Retired Status')).toBe('Some Retired Status');
  });

  it('still finds a label for an option that has been switched off', () => {
    const stored = rows(row('uom', 'TUBE', 'Tube', { active: false }));
    expect(labelForKey(stored, 'uom', 'TUBE')).toBe('Tube');
  });
});

describe('renaming a workflow label does not change what the code sees', () => {
  it('keeps the key while the label moves', () => {
    const stored = rows(
      row('order_status', 'Delivered', 'Handed Over', { locked: true, sort: 0 }),
      row('order_status', 'Shipped', 'Out for Delivery', { locked: true, sort: 1 }),
    );
    // What staff read has changed entirely.
    expect(optionsFor(stored, 'order_status').map(o => o.label)).toEqual(['Handed Over', 'Out for Delivery']);
    // What deducts stock and raises the invoice has not.
    expect(keysFor(stored, 'order_status')).toEqual(['Delivered', 'Shipped']);
  });
});
