import { describe, it, expect } from 'vitest';
import {
  balanceAfterInvoiceDeleted, balanceAfterCreditNote, balanceAfterCreditNoteWithdrawn,
  validateCreditNote, partyByName, balanceDrift, needsCorrection,
} from '../ledgerWrites';

describe('balanceAfterInvoiceDeleted', () => {
  it('takes the invoice total off, because raising it put the total on', () => {
    expect(balanceAfterInvoiceDeleted(190000, 11800)).toBe(178200);
  });

  it('leaves a customer in credit rather than clamping at zero', () => {
    // Deleting the only invoice somebody has already paid should leave the
    // business holding their money, and say so.
    expect(balanceAfterInvoiceDeleted(0, 11800)).toBe(-11800);
  });

  it('rounds to paise', () => {
    expect(balanceAfterInvoiceDeleted(100.005, 0.005)).toBe(100);
  });

  it('treats unreadable input as zero rather than NaN', () => {
    expect(balanceAfterInvoiceDeleted(undefined, 500)).toBe(-500);
    expect(balanceAfterInvoiceDeleted(500, undefined)).toBe(500);
  });
});

describe('credit notes move the balance both ways', () => {
  it('reduces what the customer owes', () => {
    expect(balanceAfterCreditNote(5000, 1200)).toBe(3800);
  });

  it('puts it back when withdrawn', () => {
    expect(balanceAfterCreditNoteWithdrawn(3800, 1200)).toBe(5000);
  });

  it('round-trips exactly, so withdrawing undoes issuing', () => {
    const start = 7355.55;
    const after = balanceAfterCreditNote(start, 1234.56);
    expect(balanceAfterCreditNoteWithdrawn(after, 1234.56)).toBe(start);
  });

  it('leaves a credit larger than the balance as a credit, not as zero', () => {
    expect(balanceAfterCreditNote(1000, 1500)).toBe(-500);
  });
});

describe('validateCreditNote', () => {
  it('accepts a real one', () => {
    expect(validateCreditNote({ customerName: 'Gujarat Super Stockist', amount: 500 }))
      .toEqual({ ok: true });
  });

  it('refuses one for nothing', () => {
    expect(validateCreditNote({ customerName: 'X', amount: 0 }).ok).toBe(false);
    expect(validateCreditNote({ customerName: 'X', amount: -5 }).ok).toBe(false);
    expect(validateCreditNote({ customerName: 'X', amount: 'lots' }).ok).toBe(false);
  });

  it('refuses one for nobody', () => {
    expect(validateCreditNote({ amount: 500 }).ok).toBe(false);
    expect(validateCreditNote({ customerName: '   ', amount: 500 }).ok).toBe(false);
    expect(validateCreditNote({}).ok).toBe(false);
  });

  it('explains every refusal', () => {
    expect(validateCreditNote({}).error).toBeTruthy();
    expect(validateCreditNote({ customerName: 'X' }).error).toMatch(/amount/i);
  });
});

describe('partyByName', () => {
  const LISTS = {
    distributors: [{ id: 'D1', name: 'Gujarat Super Stockist' }],
    dealers: [{ id: 'DL1', name: 'Shree Ayur Agencies' }],
    retailers: [{ id: 'R1', name: 'Krishna Pharma' }],
  };

  it('finds a party at each tier', () => {
    expect(partyByName('Gujarat Super Stockist', LISTS).type).toBe('Distributor');
    expect(partyByName('Shree Ayur Agencies', LISTS).type).toBe('Dealer');
    expect(partyByName('Krishna Pharma', LISTS).type).toBe('Retailer');
  });

  it('ignores case and surrounding space', () => {
    expect(partyByName('  gujarat super stockist ', LISTS).party.id).toBe('D1');
  });

  it('credits the higher tier when a name matches at two', () => {
    // Credit notes still match by name, so this tie-break still applies to
    // them even though invoices no longer need it.
    const clash = {
      distributors: [{ id: 'D9', name: 'Same Name Ltd' }],
      dealers: [{ id: 'DL9', name: 'Same Name Ltd' }],
      retailers: [],
    };
    expect(partyByName('Same Name Ltd', clash).type).toBe('Distributor');
  });

  it('is null for a name matching nobody, so no ledger is touched', () => {
    expect(partyByName('Somebody Passing', LISTS)).toEqual({ party: null, type: null });
    expect(partyByName('', LISTS)).toEqual({ party: null, type: null });
    expect(partyByName(null, LISTS)).toEqual({ party: null, type: null });
  });

  it('survives missing lists', () => {
    expect(partyByName('X', {})).toEqual({ party: null, type: null });
    expect(partyByName('X')).toEqual({ party: null, type: null });
  });
});

describe('balanceDrift', () => {
  const LEDGER = [{ balance: 100 }, { balance: 250 }, { balance: 190200 }];

  it('measures the gap between the ledger and the stored figure', () => {
    // The 10,200 that started this: the ledger counted invoices with tax, the
    // stored balance had been given them without.
    expect(balanceDrift(180000, LEDGER).drift).toBe(10200);
  });

  it('is negative when the stored figure is the larger', () => {
    expect(balanceDrift(200000, LEDGER).drift).toBe(-9800);
  });

  it('is zero when they agree, and no correction is offered', () => {
    expect(balanceDrift(190200, LEDGER).drift).toBe(0);
    expect(needsCorrection(190200, LEDGER)).toBe(false);
  });

  it('ignores float noise below a rupee', () => {
    // Offering to correct half a paisa trains people to click through the one
    // that matters.
    expect(balanceDrift(190200.4, LEDGER).drift).toBe(0);
    expect(needsCorrection(190200.4, LEDGER)).toBe(false);
  });

  it('treats an empty ledger as owing nothing', () => {
    expect(balanceDrift(5000, []).drift).toBe(-5000);
    expect(balanceDrift(0, []).drift).toBe(0);
  });

  it('reports both figures, so a screen can show the change', () => {
    const r = balanceDrift(180000, LEDGER);
    expect(r.stored).toBe(180000);
    expect(r.derived).toBe(190200);
  });

  it('survives a ledger entry with no readable balance', () => {
    expect(balanceDrift(0, [{ balance: 'x' }]).derived).toBe(0);
  });
});
