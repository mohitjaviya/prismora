import { describe, it, expect } from 'vitest';
import { gstKindOf, orderBilling, invoiceTypeLabel, isNonGstInvoice, NON_GST_REASONS } from '../billing';
import { gstKindTotals, profitAndLoss, receivables, proformaSummary } from '../financials';
import { gstHsnSummary, taxInvoices, NIL_RATED_HSN } from '../gstReport';
import { buildLedgerEntries } from '../distributorUtils';

// Gap 20: orders billed without GST. A proforma (GST 0, not final) is not a
// sale; a proforma finalised without GST (097, 'non_gst') is, like a tax invoice.
const base = { status: 'Unpaid', amountPaid: 0, createdAt: '2026-10-13T10:00:00Z', dueDate: '2026-11-12T10:00:00Z', distributorId: 'D1' };
const withGst = { ...base, id: 'G1', orderId: 'O1', invoiceType: 'tax_invoice', amount: 1000, tax: 120, cgst: 0, sgst: 0, igst: 120,
  lines: [{ name: 'Gel', hsnCode: '3304', gstPct: 12, amount: 1000, gstAmount: 120 }] };
const nonGst = { ...base, id: 'N1', orderId: 'O2', invoiceType: 'non_gst', amount: 1000, tax: 0, cgst: 0, sgst: 0, igst: 0,
  nonGstReason: 'Unregistered partner (no GSTIN)', lines: [{ name: 'Gel', hsnCode: '3304', gstPct: 0, amount: 1000, gstAmount: 0 }] };
const billedWithout = { ...base, id: 'T0', orderId: null, invoiceType: 'tax_invoice', amount: 500, tax: 0, cgst: 0, sgst: 0, igst: 0,
  lines: [{ name: 'Custom invoice', amount: 500, gstPct: null, gstAmount: 0 }] };
const proforma = { ...base, id: 'P1', orderId: 'O3', invoiceType: 'auto_draft', amount: 800, tax: 0, cgst: 0, sgst: 0, igst: 0,
  lines: [{ name: 'Gel', hsnCode: '3304', gstPct: 12, amount: 800 }] };
const settled = (i) => ({ ...i, status: 'Settled', amountPaid: Number(i.amount) + Number(i.tax) });

describe('GST / Non-GST / Proforma', () => {
  it('reads the kind from the type and the stored tax', () => {
    expect(gstKindOf(withGst)).toBe('GST');
    expect(gstKindOf(nonGst)).toBe('Non-GST');
    expect(gstKindOf(billedWithout)).toBe('Non-GST');
    expect(gstKindOf(proforma)).toBe('Proforma');
  });

  it('labels a non-GST invoice as an invoice, never a tax invoice', () => {
    expect(invoiceTypeLabel(nonGst)).toBe('Invoice – no GST');
    expect(isNonGstInvoice(nonGst)).toBe(true);
    expect(isNonGstInvoice(proforma)).toBe(false);
    expect(NON_GST_REASONS).toContain('Other');
  });

  it('totals taxable, GST and total apart for each kind', () => {
    const t = gstKindTotals([withGst, nonGst, billedWithout, settled(proforma)]);
    expect(t.GST).toMatchObject({ count: 1, taxable: 1000, gst: 120, total: 1120, due: 1120 });
    expect(t['Non-GST']).toMatchObject({ count: 2, taxable: 1500, gst: 0, total: 1500, due: 1500 });
    expect(t.Proforma).toMatchObject({ count: 1, taxable: 800, total: 800, received: 800, due: 0 });
  });
});

describe('a finalised non-GST invoice is a sale; a proforma is not', () => {
  it('counts in net sales once paid, with no GST to remit', () => {
    const pnl = profitAndLoss({ invoices: [settled(withGst), settled(nonGst), settled(proforma)] });
    expect(pnl.netSales).toBe(2000);
    expect(pnl.gstCollected).toBe(120);
  });

  it('is a receivable while unpaid; the proforma is pending invoicing', () => {
    const r = receivables([withGst, nonGst, proforma], new Date('2026-10-14'));
    expect(r.invoices.map(i => i.id).sort()).toEqual(['G1', 'N1']);
    expect(r.due).toBe(2120);
    expect(proformaSummary([withGst, nonGst, proforma])).toMatchObject({ count: 1, value: 800 });
  });

  it('is in the register list (taxInvoices) and on the ledger as "no GST"', () => {
    expect(taxInvoices([withGst, nonGst, proforma]).map(i => i.id)).toEqual(['G1', 'N1']);
    const rows = buildLedgerEntries({ id: 'D1' }, [withGst, nonGst, proforma], [], [], [], []);
    const desc = Object.fromEntries(rows.map(r => [r.ref, r]));
    expect(desc.N1.description).toBe('Invoice N1 (no GST)');
    expect(desc.N1.debit).toBe(1000);
    expect(desc.G1.description).toBe('Invoice G1');
    expect(desc.P1.description).toBe('Invoice P1 (proforma)');
  });
});

describe('GSTR-1: invoices without GST as one nil-rated line', () => {
  it('keeps them out of the HSN rows and adds them at the end', () => {
    const rows = gstHsnSummary([withGst, nonGst, billedWithout, proforma]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ hsn: '3304', rate: '12%', taxable: 1000, igst: 120, total: 1120 });
    expect(rows[1]).toEqual({ hsn: NIL_RATED_HSN, rate: '0%', taxable: 1500, cgst: 0, sgst: 0, igst: 0, total: 1500 });
  });

  it('adds no nil-rated line when there is none', () => {
    expect(gstHsnSummary([withGst, proforma]).some(r => r.hsn === NIL_RATED_HSN)).toBe(false);
  });
});

describe('orderBilling', () => {
  it('reads taxable, GST and total from the order invoice', () => {
    expect(orderBilling({ id: 'O1', value: 1000 }, [withGst])).toMatchObject({ kind: 'GST', taxable: 1000, gst: 120, total: 1120 });
    expect(orderBilling({ id: 'O2', value: 1000 }, [nonGst])).toMatchObject({ kind: 'Non-GST', gst: 0, total: 1000 });
    expect(orderBilling({ id: 'O3', value: 800 }, [proforma])).toMatchObject({ kind: 'Proforma', gst: 0, total: 800 });
  });

  it('before invoicing: the value as taxable, no GST or total yet', () => {
    expect(orderBilling({ id: 'O9', value: 450 }, [withGst])).toEqual({ invoice: null, kind: 'Not invoiced', taxable: 450, gst: null, total: null });
  });
});
