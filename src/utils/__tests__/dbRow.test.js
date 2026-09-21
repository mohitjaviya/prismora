import { describe, it, expect } from 'vitest';
import { isIdColumn, blankIdsToNull } from '../dbRow';

describe('isIdColumn', () => {
  it('recognises every foreign key this schema has', () => {
    // The full set from 021, 024 and 025. If a new one is added and does not
    // match, it will lose its blank-to-NULL conversion silently.
    [
      'territoryId', 'distributorId', 'dealerId', 'retailerId',
      'parentDistributorId', 'parentDealerId', 'schemeId', 'orderId',
      'invoiceId', 'vendorId', 'beatId', 'userId', 'poId', 'leadId', 'batchId',
    ].forEach(col => expect(isIdColumn(col), col).toBe(true));
  });

  it('leaves the primary key alone', () => {
    // `id` is lower-case, so it does not end in `Id`. A primary key quietly
    // turning into NULL is a worse failure than the one being fixed.
    expect(isIdColumn('id')).toBe(false);
  });

  it('is not fooled by other columns', () => {
    ['gstin', 'paid', 'name', 'city', 'status', 'valid', 'createdAt', '', null, undefined]
      .forEach(col => expect(isIdColumn(col), String(col)).toBe(false));
  });
});

describe('blankIdsToNull', () => {
  it('turns an unchosen optional reference into NULL', () => {
    // The actual bug: a lead saved with no territory sent territoryId: '',
    // and the foreign key went looking for a territory whose id is the empty
    // string. 23503, and the whole insert refused.
    expect(blankIdsToNull({ name: 'Lead', territoryId: '' }))
      .toEqual({ name: 'Lead', territoryId: null });
  });

  it('treats whitespace as unchosen too', () => {
    expect(blankIdsToNull({ territoryId: '   ' }).territoryId).toBeNull();
  });

  it('leaves a real reference exactly as it came', () => {
    const row = { territoryId: 'T-1789970451012', distributorId: 'DIST-1' };
    expect(blankIdsToNull(row)).toEqual(row);
  });

  it('does not touch the primary key, however blank', () => {
    expect(blankIdsToNull({ id: '', name: 'x' })).toEqual({ id: '', name: 'x' });
  });

  it('leaves every other empty string alone', () => {
    // An empty `notes` or `city` is an empty string on purpose. Turning those
    // into NULL would change what the rest of the application reads back.
    const row = { notes: '', city: '', gstin: '', name: '' };
    expect(blankIdsToNull(row)).toEqual(row);
  });

  it('does not mistake 0 or false for blank', () => {
    expect(blankIdsToNull({ batchId: 0, orderId: false })).toEqual({ batchId: 0, orderId: false });
  });

  it('leaves a null that was already null', () => {
    expect(blankIdsToNull({ territoryId: null })).toEqual({ territoryId: null });
    expect(blankIdsToNull({ territoryId: undefined })).toEqual({ territoryId: undefined });
  });

  it('does not modify the row it was given', () => {
    const row = { territoryId: '' };
    blankIdsToNull(row);
    expect(row.territoryId).toBe('');
  });

  it('fixes the exact row the Leads form produced', () => {
    // The reported failure, pinned to the shape that caused it. Leads.jsx
    // initialises territoryId to '' because that is what an unselected
    // <select> holds; the field is optional and the dropdown was never
    // touched. fk_leads_territoryid then refused the whole insert.
    const blankLeadForm = {
      name: 'Walk-in enquiry', company: '', phone: '9825000000', email: '',
      productInterest: [], leadSource: 'Walk-in', assignedTo: 'U1',
      status: 'Lead Created', followUpDate: '', notes: '', dealValue: '',
      state: 'Gujarat', city: 'Ahmedabad', district: '', territoryId: '',
      leadType: '', createdAt: '2026-09-21T00:00:00.000Z',
    };

    const row = blankIdsToNull(blankLeadForm);
    expect(row.territoryId).toBeNull();
    // And nothing else moved: the other blanks on this form are real values.
    expect(row.company).toBe('');
    expect(row.notes).toBe('');
    expect(row.assignedTo).toBe('U1');
    expect(row.name).toBe('Walk-in enquiry');
  });

  it('copes with something that is not a row', () => {
    expect(blankIdsToNull(null)).toBeNull();
    expect(blankIdsToNull(undefined)).toBeUndefined();
    expect(blankIdsToNull('nope')).toBe('nope');
    expect(blankIdsToNull([{ territoryId: '' }])).toEqual([{ territoryId: '' }]);
  });
});
