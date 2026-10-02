/**
 * GST figures for the reports (Phase 2 H1, H2, H13).
 *
 * The Invoice Register and the GSTR-1 HSN summary used to work the tax out
 * again: the register halved every invoice's tax into CGST and SGST, and the
 * HSN summary guessed intra- or inter-state from the order's state (Gujarat
 * when there was no order). Inter-state invoices were reported as CGST + SGST
 * — ₹683 of IGST on the demo data. Both now read what the invoice was issued
 * with (invoiceGst: the stored CGST / SGST / IGST, migration 053), the same
 * figures the printed invoice shows.
 *
 * A proforma is a request for payment, not a tax invoice: it is not a sale and
 * does not belong in a GST return, so both reports leave it out.
 */
import { invoiceGst } from './gst';
import { isProforma } from './billing';

const paise = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Tax invoices only — what a sales total or GST return may count. */
export const taxInvoices = (invoices) => (invoices || []).filter(i => !isProforma(i));

/** One Invoice Register row: base, the stored split, and the total. */
export const registerRow = (inv, seller = {}) => {
  const base = Number(inv?.amount || 0);
  const tax = Number(inv?.tax || 0);
  const gst = invoiceGst(inv, seller);
  return {
    subtotal: paise(base),
    cgst: paise(gst.cgst),
    sgst: paise(gst.sgst),
    igst: paise(gst.igst),
    total: paise(base + tax),
    placeOfSupply: gst.placeOfSupply || '—',
    supplyType: gst.supplyType,
  };
};

/**
 * The lines an invoice was raised with. An invoice from before line items
 * (039) is read as one line: its product, from the order, at the catalogue's
 * HSN and rate if known.
 */
const linesOf = (inv, order, productCatalog) => {
  if (Array.isArray(inv?.lines) && inv.lines.length > 0) return inv.lines;
  const prod = order ? (productCatalog || []).find(p => p.name === order.product) : null;
  return [{
    name: order?.product || '',
    hsnCode: prod?.hsnCode || null,
    gstPct: prod?.gstPct ?? null,
    amount: Number(inv?.amount || 0),
    gstAmount: Number(inv?.tax || 0),
  }];
};

/**
 * GSTR-1 HSN summary: taxable value and tax by HSN code and rate, with each
 * invoice's stored CGST / SGST / IGST shared across its lines in proportion
 * to each line's tax. Totals therefore equal the invoices' stored figures.
 */
export const gstHsnSummary = (invoices, { orders = [], productCatalog = [], seller = {} } = {}) => {
  const byKey = {};
  taxInvoices(invoices).forEach(inv => {
    const order = orders.find(o => o.id === inv.orderId);
    const gst = invoiceGst(inv, seller);
    const lines = linesOf(inv, order, productCatalog);
    const invTax = Number(inv.tax || 0);
    const lineTaxTotal = lines.reduce((s, l) => s + Number(l.gstAmount ?? 0), 0);
    lines.forEach(l => {
      const amount = Number(l.amount || 0);
      const lineTax = Number(l.gstAmount ?? 0);
      // A line's share of the invoice's tax; an untaxed invoice has none.
      const share = invTax > 0 ? (lineTaxTotal > 0 ? lineTax / lineTaxTotal : amount / (Number(inv.amount) || 1)) : 0;
      const catalog = (productCatalog || []).find(p => p.name === l.name);
      const hsn = l.hsnCode || catalog?.hsnCode || 'Not set';
      const pct = l.gstPct ?? catalog?.gstPct;
      const rate = pct !== null && pct !== undefined && pct !== ''
        ? Number(pct)
        : (amount ? Math.round((lineTax / amount) * 100) : 0);
      const key = `${hsn}-${rate}`;
      if (!byKey[key]) byKey[key] = { hsn, rate: `${rate}%`, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      const r = byKey[key];
      r.taxable += amount;
      r.cgst += gst.cgst * share;
      r.sgst += gst.sgst * share;
      r.igst += gst.igst * share;
      r.total += amount + invTax * share;
    });
  });
  return Object.values(byKey)
    .map(r => ({ ...r, taxable: paise(r.taxable), cgst: paise(r.cgst), sgst: paise(r.sgst), igst: paise(r.igst), total: paise(r.total) }))
    .sort((a, b) => b.total - a.total);
};
