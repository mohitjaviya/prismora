/**
 * The money figures, worked out once (Phase 2 H3–H7, H13).
 *
 * Accounting, the Director's cockpit, the Dashboard and the Reports each had
 * their own sum, and they disagreed: the cockpit showed a profit of ₹93.6k
 * while Accounting showed a loss of ₹1.73L, three screens meant three
 * different things by "revenue", and the receivables report ignored part-
 * payments. The owner's decisions, applied everywhere through this file:
 *
 *  · Revenue is Accounting's net sales: what tax invoices have been paid,
 *    without the GST (it is not the business's money), less credit notes (also without GST).
 *    Profit is net sales less expenses less the goods bought.
 *  · A proforma is not a tax invoice. It counts in no sales total, no
 *    receivable and no GST figure; its value is shown on its own as
 *    "pending invoicing". A credit note against a proforma goes with it.
 *  · What partners owe is the sum of the balances above zero. A partner in
 *    credit does not reduce what the others owe; credit held is shown apart.
 */
import { isProforma } from './billing';
import { amountPaid, amountDue, isOpen, invoiceTotal } from './invoiceStatus';
import { monthKey } from './months';

const n = (x) => Number(x) || 0;
const sum = (list, f) => (list || []).reduce((s, x) => s + f(x), 0);

/** Share of an invoice that has been paid, 0–1. */
const paidShare = (inv) => {
  const total = invoiceTotal(inv);
  return total > 0 ? amountPaid(inv) / total : 0;
};

/** Paid on a tax invoice, without its GST. */
export const paidExGst = (inv) => n(inv?.amount) * paidShare(inv);

/** GST on the paid part of a tax invoice: collected, to be remitted. */
export const paidGst = (inv) => n(inv?.tax) * paidShare(inv);

/** Credit notes that reduce sales: against a tax invoice, or against no invoice. */
export const salesCreditNotes = (creditNotes, invoices) => {
  const proformaIds = new Set((invoices || []).filter(isProforma).map(i => i.id));
  return (creditNotes || []).filter(cn => !(cn?.invoiceId && proformaIds.has(cn.invoiceId)));
};

/**
 * A credit note's value without GST. Notes are issued at the gross amount
 * (₹5,040 against a ₹4,500 + ₹540 invoice), while sales are counted without
 * GST, so taking the gross off overstated the returns. The GST part comes out
 * in the proportion of the note's own invoice; a note against no invoice has
 * no rate to go by and counts as recorded.
 */
export const creditNoteExGst = (cn, invoices) => {
  const amount = n(cn?.amount);
  const inv = cn?.invoiceId ? (invoices || []).find(i => i.id === cn.invoiceId) : null;
  const total = inv ? invoiceTotal(inv) : 0;
  return total > 0 ? amount * (n(inv.amount) / total) : amount;
};

/** Cost of goods: received on GRNs less goods sent back. Never below zero. */
export const purchaseCostOf = (grn, purchaseReturns) => {
  const received = sum(grn, g => sum(g.items, i => n(i.quantity) * n(i.unitCost)));
  const returned = sum(purchaseReturns, r => n(r.value));
  return { received, returned, cost: Math.max(0, received - returned) };
};

/**
 * Net sales, expenses, cost of goods and profit, as Accounting shows them.
 * Pass only the rows in the period wanted (the Reports date range).
 */
export const profitAndLoss = ({ invoices = [], creditNotes = [], expenses = [], grn = [], purchaseReturns = [] } = {}) => {
  const tax = (invoices || []).filter(i => !isProforma(i));
  const invoicedPaid = sum(tax, paidExGst);
  const gstCollected = sum(tax, paidGst);
  const creditNoteValue = sum(salesCreditNotes(creditNotes, invoices), cn => creditNoteExGst(cn, invoices));
  const netSales = invoicedPaid - creditNoteValue;
  const expenseValue = sum(expenses, e => n(e.amount));
  const goods = purchaseCostOf(grn, purchaseReturns);
  const netProfit = netSales - expenseValue - goods.cost;
  return {
    invoicedPaid, gstCollected, creditNoteValue, netSales,
    expenses: expenseValue,
    goodsReceived: goods.received, goodsReturned: goods.returned, purchaseCost: goods.cost,
    netProfit,
    margin: netSales ? (netProfit / netSales) * 100 : 0,
  };
};

/** Proformas: value raised, received, and still open — "pending invoicing". */
export const proformaSummary = (invoices) => {
  const list = (invoices || []).filter(isProforma);
  return {
    count: list.length,
    value: sum(list, invoiceTotal),
    received: sum(list, amountPaid),
    due: sum(list.filter(isOpen), amountDue),
  };
};

/** Tax invoices not yet settled, with what is still due on each. */
export const openTaxInvoices = (invoices) => (invoices || []).filter(i => !isProforma(i) && isOpen(i));

/**
 * Receivables on tax invoices: what is still due (part-payments and credit
 * notes already taken off), how much of it is overdue, and its age.
 */
export const receivables = (invoices, now = new Date()) => {
  const open = openTaxInvoices(invoices);
  const buckets = { '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 };
  let overdue = 0;
  open.forEach(i => {
    const due = amountDue(i);
    if (i.dueDate && new Date(i.dueDate) < now) overdue += due;
    const days = Math.floor((now - new Date(i.createdAt)) / 86400000);
    if (days <= 30) buckets['0-30'] += due;
    else if (days <= 60) buckets['30-60'] += due;
    else if (days <= 90) buckets['60-90'] += due;
    else buckets['90+'] += due;
  });
  return { count: open.length, due: sum(open, amountDue), overdue, buckets, invoices: open };
};

/**
 * Partner balances: owed is the sum of balances above zero, credit held the
 * sum of those below it. Never netted.
 */
export const partnerBalances = (...lists) => {
  const all = lists.flat().filter(Boolean);
  const owing = all.filter(p => n(p.outstandingAmount) > 0);
  const inCredit = all.filter(p => n(p.outstandingAmount) < 0);
  return {
    owed: sum(owing, p => n(p.outstandingAmount)),
    owingCount: owing.length,
    creditHeld: -sum(inCredit, p => n(p.outstandingAmount)),
    creditCount: inCredit.length,
  };
};

/**
 * Net sales by month (Jan…Dec keys): paid tax-invoice value without GST in
 * the invoice's month, less credit notes (without GST) in theirs.
 */
export const netSalesByMonth = (invoices, creditNotes) => {
  const out = {};
  (invoices || []).filter(i => !isProforma(i) && i.createdAt).forEach(i => {
    const m = monthKey(i.createdAt);
    out[m] = (out[m] || 0) + paidExGst(i);
  });
  salesCreditNotes(creditNotes, invoices).filter(cn => cn.createdAt).forEach(cn => {
    const m = monthKey(cn.createdAt);
    out[m] = (out[m] || 0) - creditNoteExGst(cn, invoices);
  });
  return out;
};
