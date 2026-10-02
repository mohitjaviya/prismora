import { describe, it, expect } from 'vitest';
import { taxInvoices, registerRow, gstHsnSummary } from '../gstReport';

// Shapes as stored (053): the split is on the invoice, lines carry HSN and rate.
const intra = {
  id: 'I1', invoiceType: 'tax_invoice', amount: 4500, tax: 540, cgst: 270, sgst: 270, igst: 0,
  sellerState: 'Gujarat', placeOfSupply: 'Gujarat', supplyType: 'intra', orderId: 'O1',
  lines: [{ name: 'Aloe Gel', hsnCode: '30049012', gstPct: 12, amount: 4500, gstAmount: 540 }],
};
// Inter-state direct bill: no order. The old report called this Gujarat (CGST + SGST).
const inter = {
  id: 'I2', invoiceType: 'tax_invoice', amount: 800, tax: 121, cgst: 0, sgst: 0, igst: 121,
  sellerState: 'Gujarat', placeOfSupply: 'Maharashtra', supplyType: 'inter', orderId: null,
  lines: [
    { name: 'Neem Wash', hsnCode: '33049990', gstPct: 18, amount: 500, gstAmount: 90 },
    { name: 'Shampoo', hsnCode: '33051090', gstPct: 12, amount: 300, gstAmount: 31 },
  ],
};
// Seller registered in Maharashtra, buyer in Maharashtra: intra-state there.
const intraMh = {
  id: 'I3', invoiceType: 'tax_invoice', amount: 1000, tax: 120, cgst: 60, sgst: 60, igst: 0,
  sellerState: 'Maharashtra', placeOfSupply: 'Maharashtra', supplyType: 'intra',
  lines: [{ name: 'Aloe Gel', hsnCode: '30049012', gstPct: 12, amount: 1000, gstAmount: 120 }],
};
const proforma = {
  id: 'P1', invoiceType: 'auto_draft', amount: 9500, tax: 0, cgst: 0, sgst: 0, igst: 0,
  sellerState: 'Gujarat', placeOfSupply: 'Gujarat', supplyType: 'intra',
  lines: [{ name: 'Aloe Gel', hsnCode: '30049012', gstPct: 12, amount: 9500, gstAmount: 0 }],
};

describe('taxInvoices', () => {
  it('leaves proformas out', () => {
    expect(taxInvoices([intra, proforma, inter]).map(i => i.id)).toEqual(['I1', 'I2']);
  });
});

describe('registerRow', () => {
  it('reads the stored split instead of halving the tax', () => {
    expect(registerRow(inter)).toMatchObject({ subtotal: 800, cgst: 0, sgst: 0, igst: 121, total: 921, placeOfSupply: 'Maharashtra' });
    expect(registerRow(intra)).toMatchObject({ cgst: 270, sgst: 270, igst: 0, total: 5040 });
    expect(registerRow(intraMh)).toMatchObject({ cgst: 60, sgst: 60, igst: 0 });
  });
  it('keeps paise', () => {
    const odd = { ...intra, tax: 41, cgst: 20.5, sgst: 20.5 };
    expect(registerRow(odd)).toMatchObject({ cgst: 20.5, sgst: 20.5, total: 4541 });
  });
});

describe('gstHsnSummary', () => {
  const rows = gstHsnSummary([intra, inter, intraMh, proforma]);
  const sum = (k) => Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;

  it('totals equal the invoices\' stored figures, proformas excluded', () => {
    expect(sum('taxable')).toBe(6300);
    expect(sum('cgst')).toBe(330);
    expect(sum('sgst')).toBe(330);
    expect(sum('igst')).toBe(121);
    expect(sum('total')).toBe(6300 + 781);
  });

  it('groups by each line\'s HSN and rate, inter-state as IGST', () => {
    const neem = rows.find(r => r.hsn === '33049990');
    expect(neem).toMatchObject({ rate: '18%', taxable: 500, cgst: 0, sgst: 0, igst: 90 });
    const aloe = rows.find(r => r.hsn === '30049012' && r.rate === '12%');
    expect(aloe).toMatchObject({ taxable: 5500, cgst: 330, sgst: 330, igst: 0 });
  });

  it('reads an invoice without lines from its order and the catalogue', () => {
    const old = { id: 'I9', invoiceType: 'tax_invoice', amount: 100, tax: 12, cgst: 6, sgst: 6, igst: 0, orderId: 'O9' };
    const r = gstHsnSummary([old], { orders: [{ id: 'O9', product: 'Balm' }], productCatalog: [{ name: 'Balm', hsnCode: '3004', gstPct: 12 }] });
    expect(r).toEqual([{ hsn: '3004', rate: '12%', taxable: 100, cgst: 6, sgst: 6, igst: 0, total: 112 }]);
  });
});
