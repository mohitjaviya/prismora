import { describe, it, expect } from 'vitest';
import { columnFromConstraint, constraintFromMessage, explainForeignKey } from '../writeErrors';

const FK_ERROR = {
  code: '23503',
  message: 'insert or update on table "leads" violates foreign key constraint "fk_leads_territoryid"',
  details: 'Key is not present in table "territories".',
};

describe('constraintFromMessage', () => {
  it('pulls the constraint name out', () => {
    expect(constraintFromMessage(FK_ERROR.message)).toBe('fk_leads_territoryid');
  });

  it('gives back nothing for a message that is not about a foreign key', () => {
    expect(constraintFromMessage('duplicate key value violates unique constraint "leads_pkey"')).toBeNull();
    expect(constraintFromMessage('')).toBeNull();
    expect(constraintFromMessage(undefined)).toBeNull();
  });
});

describe('columnFromConstraint', () => {
  it('finds the column the constraint is named after', () => {
    expect(columnFromConstraint('fk_leads_territoryid', { name: 'x', territoryId: 'T-1' })).toBe('territoryId');
  });

  it('copes with a table name that has underscores in it', () => {
    // fk_beat_plans_territoryid cannot be split on underscores to find the
    // column, which is why this looks for the column inside the name instead.
    expect(columnFromConstraint('fk_beat_plans_territoryid', { territoryId: 'T-1' })).toBe('territoryId');
  });

  it('handles the older PostgreSQL-generated names too', () => {
    // invoices.orderId, grn.poId and purchase_orders.vendorId predate 021 and
    // carry Postgres's own naming.
    expect(columnFromConstraint('invoices_orderId_fkey', { orderId: 'O-1' })).toBe('orderId');
    expect(columnFromConstraint('grn_poId_fkey', { poId: 'PO-1' })).toBe('poId');
  });

  it('prefers the longest match, so a shorter column name cannot win', () => {
    // 'dealerId' is a substring of 'parentDealerId'. Picking the short one
    // would name the wrong field on a retailer.
    expect(columnFromConstraint('fk_retailers_parentdealerid', { dealerId: 'D-1', parentDealerId: 'D-2' }))
      .toBe('parentDealerId');
  });

  it('only ever nominates a reference column', () => {
    // `name` and `status` are not foreign keys and must never be blamed.
    expect(columnFromConstraint('fk_leads_name', { name: 'x', status: 'y' })).toBeNull();
  });

  it('gives back nothing when the row explains nothing', () => {
    expect(columnFromConstraint('fk_leads_territoryid', { name: 'x' })).toBeNull();
    expect(columnFromConstraint('fk_leads_territoryid', {})).toBeNull();
    expect(columnFromConstraint('', { territoryId: 'T-1' })).toBeNull();
  });
});

describe('explainForeignKey', () => {
  it('names the column and the value the database would not say', () => {
    // Postgres redacts the value through PostgREST when the role cannot read
    // the referenced table — "Key is not present in table" with nothing in
    // between. It has to come from the payload instead.
    const r = explainForeignKey(FK_ERROR, { name: 'Lead', territoryId: 'T-gone' });
    expect(r.column).toBe('territoryId');
    expect(r.value).toBe('T-gone');
    expect(r.text).toMatch(/territoryId was "T-gone"/);
    expect(r.text).toMatch(/no such record/i);
  });

  it('says so when the value was empty, because that should be impossible', () => {
    // A NULL reference is not checked by a foreign key at all, so this means
    // the row that reached the database was not the row in hand.
    const r = explainForeignKey(FK_ERROR, { territoryId: null });
    expect(r.text).toMatch(/not the one this browser sent/i);
  });

  it('stays quiet about anything that is not a foreign-key failure', () => {
    expect(explainForeignKey({ code: '23505', message: 'duplicate key' }, { territoryId: 'T-1' })).toBeNull();
    expect(explainForeignKey({ code: '42703', message: 'column does not exist' }, {})).toBeNull();
    expect(explainForeignKey(null, {})).toBeNull();
  });

  it('stays quiet rather than guessing when the payload does not explain it', () => {
    // Inventing a column would be worse than leaving the original message.
    expect(explainForeignKey(FK_ERROR, { name: 'Lead' })).toBeNull();
    expect(explainForeignKey(FK_ERROR, {})).toBeNull();
    expect(explainForeignKey(FK_ERROR, undefined)).toBeNull();
  });
});
