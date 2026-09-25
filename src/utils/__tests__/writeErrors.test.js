import { describe, it, expect } from 'vitest';
import { columnFromConstraint, constraintFromMessage, explainForeignKey, plainDatabaseError } from '../writeErrors';

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

describe('plainDatabaseError - what Dispatch and Accounts are told', () => {
  it('passes a delivery refusal through as written', () => {
    const err = { code: 'P0001', message: 'Not enough stock to deliver order O6. Tulsi Cough Syrup 100ml: this order needs 100, 0 in stock.' };
    expect(plainDatabaseError(err, 'deliver this order')).toBe(err.message);
  });

  it('turns a permission refusal into a sentence', () => {
    const err = { code: '42501', message: 'new row violates row-level security policy for table "orders"' };
    expect(plainDatabaseError(err, 'mark this order Delivered')).toBe('Your role is not allowed to mark this order Delivered.');
  });

  it('keeps the accounting-access explanation from the invoice functions', () => {
    const err = { code: '42501', message: 'Your role cannot raise invoices. It needs full Accounting access.' };
    expect(plainDatabaseError(err, 'raise this invoice')).toBe(err.message);
  });

  it('explains the one-invoice-per-order rule', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "invoices_one_per_order"' };
    expect(plainDatabaseError(err)).toMatch(/already has an invoice/);
  });

  it('says what could not be done when the reason is unknown', () => {
    expect(plainDatabaseError({ code: 'XX000', message: 'boom' }, 'deliver this order')).toBe('Could not deliver this order: boom');
    expect(plainDatabaseError(null, 'deliver this order')).toBe('Could not deliver this order.');
  });
});
