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

  it('passes the order rules through as written (054, 061, 062)', () => {
    const say = (message, code = '42501') => plainDatabaseError({ code, message }, 'save this order');
    expect(say('Order O126 is Processing; the next step is Ready for Dispatch. It cannot go to Shipped from here.'))
      .toBe('Order O126 is Processing; the next step is Ready for Dispatch. It cannot go to Shipped from here.');
    expect(say('Order O118 has been invoiced (INV-1), so its value, quantity and items can no longer change.')).toMatch(/^Order O118 has been invoiced/);
    expect(say('Only Dispatch Team, Admin can move an order to Shipped (your role: Warehouse Manager).')).toMatch(/^Only Dispatch Team/);
    expect(say('Order O128 needs a delivery address and a pincode before it can be Processing.', '23514')).toMatch(/^Order O128 needs/);
    expect(say('new row violates row-level security policy for table "orders"')).toBe('Your role is not allowed to save this order.');
    expect(say('Purchase order PO-9 has goods received against it (GRN-14), so it cannot be deleted. Close it instead.')).toMatch(/^Purchase order PO-9 has goods received/);
  });

  it('passes the invoice and purchase-return guards through as written (075)', () => {
    const say = (message) => plainDatabaseError({ code: '42501', message }, 'delete this invoice');
    expect(say('Invoice INV-1 is an issued GST tax invoice, so it cannot be deleted. To reverse it, issue a credit note.')).toMatch(/^Invoice INV-1 is an issued/);
    expect(say('Proforma INV-2 has a payment or credit note against it, so it cannot be deleted. Withdraw those first.')).toMatch(/^Proforma INV-2 has a payment/);
    expect(say('Purchase returns are recorded and withdrawn only from Purchases → Returns, which checks the stock held.')).toMatch(/^Purchase returns are recorded/);
  });

  it('passes the stock guard through as written (080)', () => {
    const say = (message) => plainDatabaseError({ code: '42501', message }, 'change this stock batch');
    expect(say('Batch TEST-P2-EXP-26592 of Lavender Body Wash expired on 28 Sep 2026, so its expiry date cannot be moved later or cleared.')).toMatch(/^Batch TEST-P2-EXP-26592 of Lavender Body Wash expired on/);
    expect(say('Stock in batch B7 changes only through Adjust, Cycle Count or Transfer (or goods receipts, deliveries and returns), so every movement is recorded.')).toMatch(/^Stock in batch B7 changes only through/);
    expect(say('Stock in batch B7 changes warehouse only through Transfer, so the move is recorded.')).toMatch(/^Stock in batch B7 changes warehouse only through Transfer/);
    expect(say('new row violates row-level security policy for table "inventory"')).toBe('Your role is not allowed to change this stock batch.');
  });

  it('says which amount may not be zero or negative (075)', () => {
    const check = (name) => plainDatabaseError({ code: '23514', message: `new row for relation "x" violates check constraint "${name}"` }, 'save this');
    expect(check('expenses_amount_positive')).toBe('An expense must be more than zero.');
    expect(check('vendor_payments_amount_positive')).toBe('A payment must be more than zero.');
    expect(check('products_prices_not_negative')).toBe('Prices and the GST rate cannot be negative.');
  });

  it('names what still points at a row a delete was refused for', () => {
    const err = { code: '23503', message: 'update or delete on table "vendors" violates foreign key constraint "vendor_payments_vendorId_fkey" on table "vendor_payments"' };
    expect(plainDatabaseError(err, 'delete this vendor')).toBe('Cannot delete this vendor: it still has vendor payments recorded against it. Remove or move those first, or set the vendor to Inactive instead.');
  });

  it('explains the master-data rules (078)', () => {
    const check = (name) => plainDatabaseError({ code: '23514', message: `new row for relation "x" violates check constraint "${name}"` }, 'save this');
    expect(check('schemes_discount_0_100')).toMatch(/between 0 and 100/);
    expect(check('schemes_dates_in_order')).toMatch(/end before it starts/);
    expect(check('products_partner_prices_within_mrp')).toMatch(/above the MRP/);
    expect(check('dealers_credit_limit_not_negative')).toMatch(/Credit limit/);
    expect(plainDatabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "masters_list_key_ci"' }, 'save the new option'))
      .toMatch(/already has this option/);
    const inUse = 'Product "X" is in use (1 stock batch(es), 0 order(s), 0 scheme(s), 0 complaint(s)), so it cannot be deleted';
    expect(plainDatabaseError({ code: 'P0001', message: inUse }, 'delete this product')).toBe(inUse);
  });
});
