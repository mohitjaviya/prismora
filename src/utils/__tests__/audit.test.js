import { describe, it, expect } from 'vitest';
import { canViewAuditLog, actorLabel, changedFields, summarise, lastChangedBy, tableLabel } from '../audit';

describe('who may open the Audit Log', () => {
  it('is Super Admin, Admin and Director only — not every role with Settings access', () => {
    for (const r of ['Super Admin', 'Admin', 'Director']) expect(canViewAuditLog(r)).toBe(true);
    for (const r of ['Sales Manager', 'Accounts', 'Sales Executive', 'Warehouse Manager']) expect(canViewAuditLog(r)).toBe(false);
  });
});

describe('who did it', () => {
  it('names the person, with their role at the time', () => {
    expect(actorLabel({ actor_id: 'U-1', actor_name: 'Ravi', actor_role: 'Dispatch Team' }))
      .toEqual({ name: 'Ravi', role: 'Dispatch Team', system: false });
  });

  it('says System only when the database had no person at all', () => {
    expect(actorLabel({ actor_id: null })).toEqual({ name: 'System', role: '', system: true });
  });

  it('still shows someone whose account has gone, by id', () => {
    expect(actorLabel({ actor_id: 'U-gone', actor_name: null }).name).toBe('U-gone');
  });
});

describe('what changed', () => {
  const entry = { action: 'changed', table_name: 'orders', row_id: 'O6', changes: { status: ['Shipped', 'Delivered'], deliveredQty: [0, 10] } };

  it('lists each field old → new', () => {
    expect(changedFields(entry)).toEqual([
      { field: 'status', from: 'Shipped', to: 'Delivered' },
      { field: 'deliveredQty', from: '0', to: '10' },
    ]);
    expect(summarise(entry)).toBe('status: Shipped → Delivered; deliveredQty: 0 → 10');
  });

  it('describes a creation and a deletion', () => {
    expect(summarise({ action: 'created', table_name: 'expenses', row_id: 'EXP-12' })).toBe('Created expense EXP-12');
    expect(summarise({ action: 'deleted', table_name: 'roles', row_id: 'Director' })).toBe('Deleted role permissions Director');
  });

  it('shows a blank as a dash rather than nothing', () => {
    expect(changedFields({ action: 'changed', changes: { notes: [null, 'Called back'] } }))
      .toEqual([{ field: 'notes', from: '—', to: 'Called back' }]);
  });

  it('labels tables for people', () => {
    expect(tableLabel('distributor_payments')).toBe('Partner payment');
    expect(tableLabel('something_new')).toBe('something_new');
  });
});

describe('last changed by', () => {
  const users = [{ id: 'U-1', name: 'Ravi' }];
  it('reads the stamp the audit trigger writes', () => {
    expect(lastChangedBy({ updatedBy: 'U-1', updatedAt: '2026-09-25T10:00:00Z' }, users))
      .toEqual({ id: 'U-1', name: 'Ravi', at: '2026-09-25T10:00:00Z' });
  });
  it('is nothing until a row has been stamped', () => {
    expect(lastChangedBy({}, users)).toBeNull();
  });
});
