import { recordedById } from './attribution';
// Every distributor, dealer and retailer as one selectable list, each tagged
// with the tier it came from.
//
// Staff roles have full access to the Ledger and Stock screens but are not
// themselves a party, so they pick whose figures to look at. The tier matters
// beyond the label: it decides which id field an order carries
// (distributorId / dealerId / retailerId), so it has to travel with the record
// rather than being inferred from the signed-in user's role.
export const allParties = (distributors = [], dealers = [], retailers = []) => [
  ...distributors.map(p => ({ ...p, partyType: 'Distributor' })),
  ...dealers.map(p => ({ ...p, partyType: 'Dealer' })),
  ...retailers.map(p => ({ ...p, partyType: 'Retailer' })),
];

// Builds a combined, running-balance ledger for a distributor, dealer, or
// retailer: invoices are debits; payments and credit notes are credits.
//
// The same rule the database uses for the balance (043/045/046, and the
// partner_balance_drift check in 048): a line belongs to a partner by id —
// the invoice's own partner id, else its order's — and never by name. The
// name fallback this used to have credited one partner's bills to another of
// the same name, and a ledger without credit notes could not add up to the
// balance. With the same rule on both sides, the last running balance equals
// the stored balance.
const partyIdOf = (row) => row?.distributorId || row?.dealerId || row?.retailerId || null;

export const invoiceParty = (inv, orderById) => {
  const own = partyIdOf(inv);
  if (own) return own;
  const order = inv?.orderId ? orderById.get(inv.orderId) : null;
  return partyIdOf(order);
};

// Same moment: the charge before the money against it, so a running balance
// never dips below zero between an invoice and the payment settling it.
const TYPE_ORDER = { Invoice: 0, 'Credit Note': 1, Payment: 2 };

export const buildLedgerEntries = (party, invoices = [], payments = [], orders = [], creditNotes = []) => {
  if (!party) return [];

  const orderById = new Map((orders || []).map(o => [o.id, o]));

  const debitRows = (invoices || [])
    .filter(inv => invoiceParty(inv, orderById) === party.id)
    .map(inv => ({
      id: `inv-${inv.id}`,
      date: inv.createdAt,
      type: 'Invoice',
      ref: inv.id,
      description: `Invoice ${inv.id}${inv.status === 'Overdue' ? ' (Overdue)' : ''}`,
      debit: Number(inv.amount || 0) + Number(inv.tax || 0),
      credit: 0,
      // Carried through so a ledger can say who put each line there. Most
      // invoices are raised by delivery rather than by a person, and those
      // stay null.
      recordedBy: recordedById(inv),
    }));

  const creditRows = (payments || [])
    .filter(p => partyIdOf(p) === party.id)
    .map(p => ({
      id: `pay-${p.id}`,
      date: p.date || p.createdAt,
      at: p.createdAt || p.date,
      type: 'Payment',
      ref: p.id,
      description: `Payment received${p.method ? ` via ${p.method}` : ''}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
      debit: 0,
      credit: Number(p.amount || 0),
      recordedBy: recordedById(p),
    }));

  const noteRows = (creditNotes || [])
    .filter(c => partyIdOf(c) === party.id)
    .map(c => ({
      id: `cn-${c.id}`,
      date: c.createdAt,
      type: 'Credit Note',
      ref: c.id,
      description: `Credit note ${c.id}${c.reason ? ` — ${c.reason}` : ''}${c.invoiceId ? ` (against ${c.invoiceId})` : ''}`,
      debit: 0,
      credit: Number(c.amount || 0),
      recordedBy: recordedById(c),
    }));

  const rows = [...debitRows, ...creditRows, ...noteRows].sort((a, b) =>
    (new Date(a.date) - new Date(b.date)) || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]));

  let balance = 0;
  return rows.map(row => {
    balance += row.debit - row.credit;
    return { ...row, balance };
  });
};

// Payables ledger for a vendor: goods received (GRNs) are debits — money we owe
// them — and recorded vendor payments are credits. Running balance = current
// outstanding payable to that vendor.
export const buildVendorLedger = (vendor, grns = [], vendorPayments = [], purchaseReturns = [], purchaseOrders = []) => {
  if (!vendor) return [];

  // Whose receipt it is, as the database decides (grn_vendor, 065): the PO's
  // vendor, and only without one the vendor of that name. Matching by name
  // alone put a renamed vendor's receipts on nobody's ledger.
  const poVendor = new Map((purchaseOrders || []).map(po => [po.id, po.vendorId]));
  const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const debitRows = grns
    .filter(g => {
      const viaPo = g.poId ? poVendor.get(g.poId) : null;
      return viaPo ? viaPo === vendor.id : sameName(g.vendorName, vendor.name);
    })
    .map(g => ({
      id: `grn-${g.id}`,
      date: g.receivedDate || g.createdAt,
      at: g.createdAt || g.receivedDate,
      type: 'Goods Received',
      ref: g.id,
      description: `GRN ${g.id}${g.poId ? ` (PO ${g.poId})` : ''}`,
      debit: (g.items || []).reduce((s, i) => s + (Number(i.quantity ?? i.receivedQty ?? 0) * Number(i.unitCost || 0)), 0),
      credit: 0
    }));

  const paymentRows = vendorPayments
    .filter(p => p.vendorId === vendor.id)
    .map(p => ({
      id: `vpay-${p.id}`,
      date: p.date || p.createdAt,
      at: p.createdAt || p.date,
      type: 'Payment',
      ref: p.id,
      description: `Payment made${p.method ? ` via ${p.method}` : ''}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
      debit: 0,
      credit: Number(p.amount || 0),
      recordedBy: recordedById(p),
    }));

  const returnRows = purchaseReturns
    .filter(r => r.vendorId === vendor.id)
    .map(r => ({
      id: `pr-${r.id}`,
      date: r.date || r.createdAt,
      at: r.createdAt || r.date,
      type: 'Purchase Return',
      ref: r.id,
      description: `Return ${r.id}${r.reason ? ` — ${r.reason}` : ''}`,
      debit: 0,
      credit: Number(r.value || 0)
    }));

  // By business date, then by when each entry was actually recorded, so a
  // payment and a return on the same day run in the order they happened.
  const day = (d) => String(d || '').slice(0, 10);
  const rows = [...debitRows, ...paymentRows, ...returnRows].sort((a, b) =>
    day(a.date).localeCompare(day(b.date)) || (new Date(a.at) - new Date(b.at)));

  let balance = 0;
  return rows.map(row => {
    balance += row.debit - row.credit;
    return { ...row, balance };
  });
};
