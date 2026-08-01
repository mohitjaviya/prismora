// Builds a combined, running-balance ledger for a distributor, dealer, or
// retailer from their invoices (debits) and recorded payments (credits).
export const buildLedgerEntries = (party, invoices = [], payments = []) => {
  if (!party) return [];

  const debitRows = invoices
    .filter(inv => (inv.customerName || '').toLowerCase() === (party.name || '').toLowerCase())
    .map(inv => ({
      id: `inv-${inv.id}`,
      date: inv.createdAt,
      type: 'Invoice',
      ref: inv.id,
      description: `Invoice ${inv.id}${inv.status === 'Overdue' ? ' (Overdue)' : ''}`,
      debit: Number(inv.amount || 0) + Number(inv.tax || 0),
      credit: 0
    }));

  const creditRows = payments
    .filter(p => p.distributorId === party.id || p.dealerId === party.id || p.retailerId === party.id)
    .map(p => ({
      id: `pay-${p.id}`,
      date: p.date || p.createdAt,
      type: 'Payment',
      ref: p.id,
      description: `Payment received${p.method ? ` via ${p.method}` : ''}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
      debit: 0,
      credit: Number(p.amount || 0)
    }));

  const rows = [...debitRows, ...creditRows].sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = 0;
  return rows.map(row => {
    balance += row.debit - row.credit;
    return { ...row, balance };
  });
};

// Payables ledger for a vendor: goods received (GRNs) are debits — money we owe
// them — and recorded vendor payments are credits. Running balance = current
// outstanding payable to that vendor.
export const buildVendorLedger = (vendor, grns = [], vendorPayments = [], purchaseReturns = []) => {
  if (!vendor) return [];

  const debitRows = grns
    .filter(g => (g.vendorName || '').toLowerCase() === (vendor.name || '').toLowerCase())
    .map(g => ({
      id: `grn-${g.id}`,
      date: g.receivedDate || g.createdAt,
      type: 'Goods Received',
      ref: g.id,
      description: `GRN ${g.id}${g.poId ? ` (PO ${g.poId})` : ''}`,
      debit: (g.items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitCost || 0)), 0),
      credit: 0
    }));

  const paymentRows = vendorPayments
    .filter(p => p.vendorId === vendor.id)
    .map(p => ({
      id: `vpay-${p.id}`,
      date: p.date || p.createdAt,
      type: 'Payment',
      ref: p.id,
      description: `Payment made${p.method ? ` via ${p.method}` : ''}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
      debit: 0,
      credit: Number(p.amount || 0)
    }));

  const returnRows = purchaseReturns
    .filter(r => r.vendorId === vendor.id)
    .map(r => ({
      id: `pr-${r.id}`,
      date: r.date || r.createdAt,
      type: 'Purchase Return',
      ref: r.id,
      description: `Return ${r.id}${r.reason ? ` — ${r.reason}` : ''}`,
      debit: 0,
      credit: Number(r.value || 0)
    }));

  const rows = [...debitRows, ...paymentRows, ...returnRows].sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = 0;
  return rows.map(row => {
    balance += row.debit - row.credit;
    return { ...row, balance };
  });
};
