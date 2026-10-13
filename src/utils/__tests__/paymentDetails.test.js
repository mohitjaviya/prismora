import { describe, it, expect } from 'vitest';
import {
  paymentDetailProblems, paymentDetailsArg, paymentReferenceArg, duplicateReferenceWarning, paymentAllocation,
  allocationText, paymentModeText, paymentReferenceText, paymentApplications, paymentLedgerText, receivedIntoSuggestions,
  blankPaymentForm, applicationsForAll,
} from '../paymentDetails';
import { partnerPaymentRpcArgs } from '../settlement';
import { proofFileProblem, proofPath } from '../paymentProofs';

const today = '2026-10-13';
const form = (extra) => blankPaymentForm(today, { amount: '100', ...extra });

describe('paymentDetailProblems (Gap 8, same rules as 099)', () => {
  it('UPI and Bank Transfer need the UTR', () => {
    expect(paymentDetailProblems(form({ method: 'UPI' }), { today }).reference).toBe('Enter the UTR / reference');
    expect(paymentDetailProblems(form({ method: 'Bank Transfer', reference: '  ' }), { today }).reference).toBe('Enter the UTR / reference');
    expect(paymentDetailProblems(form({ method: 'UPI', reference: 'UTR1' }), { today })).toEqual({});
  });
  it('Cheque needs number, date and bank', () => {
    const e = paymentDetailProblems(form({ method: 'Cheque' }), { today });
    expect(Object.keys(e).sort()).toEqual(['bankName', 'instrumentDate', 'instrumentNumber']);
    expect(paymentDetailProblems(form({ method: 'Cheque', instrumentNumber: '1', instrumentDate: '2026-10-20', bankName: 'SBI' }), { today })).toEqual({});
  });
  it('Demand Draft needs number, date and bank', () => {
    expect(paymentDetailProblems(form({ method: 'Demand Draft', instrumentNumber: 'D1', instrumentDate: '2026-10-01' }), { today })).toEqual({ bankName: 'Enter the bank name' });
    expect(paymentDetailProblems(form({ method: 'Demand Draft' }), { today }).instrumentNumber).toBe('Enter the DD number');
  });
  it('Card needs a transaction ID; Other a description; Cash nothing', () => {
    expect(paymentDetailProblems(form({ method: 'Card' }), { today }).reference).toBe('Enter the card transaction ID');
    expect(paymentDetailProblems(form({ method: 'Other' }), { today }).modeDetail).toBe('Describe how the payment was made');
    expect(paymentDetailProblems(form({ method: 'Cash' }), { today })).toEqual({});
  });
  it('no future date, a date is needed, an unknown mode is refused', () => {
    expect(paymentDetailProblems(form({ method: 'Cash', date: '2026-10-14' }), { today }).date).toMatch(/future/);
    expect(paymentDetailProblems(form({ method: 'Cash', date: '' }), { today }).date).toMatch(/Enter/);
    expect(paymentDetailProblems(form({ method: 'Bitcoin' }), { today }).method).toMatch(/mode/);
  });
  it('without 099: only the date, no mode checks', () => {
    expect(paymentDetailProblems(form({ method: 'UPI' }), { today, detailsOn: false })).toEqual({});
  });
  it('length limits', () => {
    expect(paymentDetailProblems(form({ method: 'UPI', reference: 'X'.repeat(101) }), { today }).reference).toMatch(/at most 100/);
  });
});

describe('what is sent (099)', () => {
  it('only the chosen mode\'s fields, cheque status defaulting to Received', () => {
    const f = form({ method: 'UPI', reference: ' U1 ', instrumentNumber: 'X', bankName: 'Y', receivedInto: ' HDFC ' });
    expect(paymentDetailsArg(f, 'D-1/1-a.pdf')).toEqual({ instrumentNumber: null, instrumentDate: null, bankName: null, chequeStatus: null, modeDetail: null, receivedInto: 'HDFC', proofPath: 'D-1/1-a.pdf' });
    expect(paymentReferenceArg(f)).toBe('U1');
    const c = form({ method: 'Cheque', reference: 'stale', instrumentNumber: '12', instrumentDate: '2026-10-01', bankName: 'SBI', chequeStatus: '' });
    expect(paymentDetailsArg(c)).toMatchObject({ instrumentNumber: '12', instrumentDate: '2026-10-01', bankName: 'SBI', chequeStatus: 'Received' });
    expect(paymentReferenceArg(c)).toBeNull();
  });
  it('p_details goes only with details; old calls are unchanged', () => {
    expect(partnerPaymentRpcArgs('Dealer', 'DL-1', { amount: 5, details: { a: 1 } }).p_details).toEqual({ a: 1 });
    expect(Object.keys(partnerPaymentRpcArgs('Dealer', 'DL-1', { amount: 5 }))).not.toContain('p_details');
    expect(partnerPaymentRpcArgs('Dealer', 'DL-1', { method: 'UPI', details: {} }, 'INV-1')).toMatchObject({ p_invoice_id: 'INV-1', p_amount: null, p_method: 'UPI', p_details: {} });
  });
});

describe('duplicateReferenceWarning', () => {
  const pays = [{ id: 'PAY-1', reference: 'utr 55', amount: 500, date: '2026-10-01' }, { id: 'PAY-2', method: 'Cheque', instrumentNumber: '000123', amount: 50 }];
  it('warns on a UTR or cheque number used before (case / space blind)', () => {
    expect(duplicateReferenceWarning(form({ method: 'UPI', reference: 'UTR55' }), pays)).toMatch(/already used on payment PAY-1/);
    expect(duplicateReferenceWarning(form({ method: 'Cheque', instrumentNumber: '000123' }), pays)).toMatch(/Cheque number 000123 .*PAY-2/);
  });
  it('quiet otherwise, and for cash receipts', () => {
    expect(duplicateReferenceWarning(form({ method: 'UPI', reference: 'NEW' }), pays)).toBeNull();
    expect(duplicateReferenceWarning(form({ method: 'Cash', reference: 'UTR55' }), pays)).toBeNull();
  });
});

describe('where the money goes', () => {
  const open = [{ id: 'INV-123', orderId: 'O1', due: 1400 }, { id: 'INV-124', orderId: 'O2', due: 500 }];
  it('oldest first, part-paid, advance', () => {
    expect(paymentAllocation(1500, open)).toEqual({ lines: [
      { id: 'INV-123', orderId: 'O1', applied: 1400, fullyPaid: true, dueAfter: 0 },
      { id: 'INV-124', orderId: 'O2', applied: 100, fullyPaid: false, dueAfter: 400 }], advance: 0 });
    expect(allocationText(1500, open)).toBe('₹1,500.00 → INV-123 (O1) fully paid, INV-124 (O2) ₹100.00 partly paid, ₹400.00 still due.');
    expect(allocationText(2000, open)).toMatch(/; ₹100\.00 extra becomes advance credit\.$/);
  });
  it('against one invoice pays only that one', () => {
    expect(allocationText(200, open, 'INV-124')).toBe('₹200.00 → INV-124 (O2) ₹200.00 partly paid, ₹300.00 still due.');
  });
  it('no open invoices: an advance', () => {
    expect(allocationText(300, [])).toBe('No outstanding invoices. This payment will be saved as an advance (credit balance).');
    expect(allocationText('', open)).toBe('');
  });
});

describe('describing a payment', () => {
  it('mode, reference, Not recorded for old rows', () => {
    expect(paymentModeText({ method: 'UPI', reference: 'U' })).toBe('UPI');
    expect(paymentModeText({ method: 'Invoice settled' })).toBe('Not recorded');
    expect(paymentModeText({})).toBe('Not recorded');
    expect(paymentModeText({ method: 'Cheque', instrumentNumber: '12', bankName: 'SBI', instrumentDate: '2026-10-01', chequeStatus: 'Bounced' })).toMatch(/^Cheque 12, SBI, .* — Bounced$/);
    expect(paymentModeText({ method: 'Cheque' })).toBe('Cheque (details not recorded)');
    expect(paymentReferenceText({ method: 'UPI' })).toBe('Not recorded');
    expect(paymentReferenceText({ method: 'Cheque', instrumentNumber: '9' })).toBe('9');
  });
});

describe('paymentApplications (the ledger and invoice history)', () => {
  const invs = [
    { id: 'INV-A', dealerId: 'DL', orderId: 'O1', amount: 100, tax: 0, createdAt: '2026-10-01' },
    { id: 'INV-B', dealerId: 'DL', orderId: 'O2', amount: 200, tax: 0, createdAt: '2026-10-02' },
  ];
  it('tied payments pay their invoice; the rest oldest first; leftovers are advance', () => {
    const pays = [
      { id: 'PAY-INV-INV-B', dealerId: 'DL', amount: 50, date: '2026-10-03' },
      { id: 'PAY-2', dealerId: 'DL', amount: 120, date: '2026-10-04' },
      { id: 'PAY-3', dealerId: 'DL', amount: 500, date: '2026-10-05' },
      { id: 'PAY-X', dealerId: 'OTHER', amount: 5, date: '2026-10-05' },
    ];
    const a = paymentApplications('DL', invs, pays);
    expect(a.get('PAY-INV-INV-B')).toEqual({ applied: [{ invoiceId: 'INV-B', orderId: 'O2', amount: 50 }], advance: 0 });
    expect(a.get('PAY-2')).toEqual({ applied: [{ invoiceId: 'INV-A', orderId: 'O1', amount: 100 }, { invoiceId: 'INV-B', orderId: 'O2', amount: 20 }], advance: 0 });
    expect(a.get('PAY-3')).toEqual({ applied: [{ invoiceId: 'INV-B', orderId: 'O2', amount: 130 }], advance: 370 });
    expect(a.has('PAY-X')).toBe(false);
    const all = applicationsForAll(invs, pays);
    expect(all.byInvoice.get('INV-B').map(x => x.paymentId)).toEqual(['PAY-INV-INV-B', 'PAY-2', 'PAY-3']);
  });
  it('a payment tied by invoiceId (098) and a -N Mark as Paid count on their invoice', () => {
    const pays = [{ id: 'PAY-9', dealerId: 'DL', amount: 30, invoiceId: 'INV-B' }, { id: 'PAY-INV-INV-A-2', dealerId: 'DL', amount: 18 }];
    const a = paymentApplications('DL', invs, pays);
    expect(a.get('PAY-9').applied[0].invoiceId).toBe('INV-B');
    expect(a.get('PAY-INV-INV-A-2').applied[0].invoiceId).toBe('INV-A');
  });
  it('the ledger line', () => {
    expect(paymentLedgerText({ method: 'UPI', reference: 'U1' }, { applied: [{ invoiceId: 'INV-A', orderId: 'O144', amount: 1 }], advance: 0 }))
      .toBe('Payment received via UPI (Ref: U1) – applied to INV-A (O144)');
    expect(paymentLedgerText({ method: 'Cash' }, { applied: [], advance: 50 })).toBe('Advance received via Cash');
    expect(paymentLedgerText({ id: 'PAY-INV-INV-A', method: 'Invoice settled', reference: 'INV-A' }, { applied: [{ invoiceId: 'INV-A', amount: 1 }], advance: 0 }))
      .toBe('Payment received (mode not recorded) – applied to INV-A');
    expect(paymentLedgerText({ method: 'UPI', reference: 'U' }, { applied: [{ invoiceId: 'INV-A', amount: 1 }], advance: 25 })).toMatch(/; ₹25\.00 advance$/);
  });
});

describe('received into and proofs', () => {
  it('suggests the names already used, once each', () => {
    expect(receivedIntoSuggestions([{ receivedInto: 'HDFC' }, { receivedInto: ' HDFC ' }, { receivedInto: 'Cash box' }, {}])).toEqual(['Cash box', 'HDFC']);
  });
  it('a proof is a PDF or image up to 10 MB, filed under the partner', () => {
    expect(proofFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(proofFileProblem({ name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 })).toMatch(/not a PDF or image/);
    expect(proofFileProblem({ name: 'a.png', type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/limit is 10 MB/);
    expect(proofPath('DL-1', 'my receipt.pdf', 5)).toBe('DL-1/5-my receipt.pdf');
  });
});
