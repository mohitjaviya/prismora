/**
 * How a partner's money came (Gap 8, 099): the payment modes, the fields each
 * one needs, where the money goes, and how a payment is described afterwards.
 *
 * The rules are the database's (payment_details_problem, 099); this mirrors
 * them so the form says what is missing before anything is sent. Without 099
 * the form keeps the old fields and none of the mode checks.
 */
import { invoiceTotal } from './settlement';

export const PAYMENT_MODES = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer (NEFT/RTGS/IMPS)' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Card', label: 'Card' },
  { value: 'Demand Draft', label: 'Demand Draft' },
  { value: 'Other', label: 'Other' },
];
export const LEGACY_MODES = ['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'];
export const CHEQUE_STATUSES = ['Received', 'Deposited', 'Cleared', 'Bounced'];

/** The fields shown for each mode, in order. `type`: 'text' | 'date' | 'chequeStatus'. */
export const MODE_FIELDS = {
  Cash: [{ field: 'reference', label: 'Receipt number', required: false }],
  UPI: [{ field: 'reference', label: 'UTR / reference', required: true, missing: 'Enter the UTR / reference' }],
  'Bank Transfer': [{ field: 'reference', label: 'UTR / reference', required: true, missing: 'Enter the UTR / reference' }],
  Cheque: [
    { field: 'instrumentNumber', label: 'Cheque number', required: true },
    { field: 'instrumentDate', label: 'Cheque date', type: 'date', required: true },
    { field: 'bankName', label: 'Bank name', required: true },
    { field: 'chequeStatus', label: 'Cheque status', type: 'chequeStatus', required: false },
  ],
  'Demand Draft': [
    { field: 'instrumentNumber', label: 'DD number', required: true, missing: 'Enter the DD number' },
    { field: 'instrumentDate', label: 'DD date', type: 'date', required: true, missing: 'Enter the DD date' },
    { field: 'bankName', label: 'Bank name', required: true },
  ],
  Card: [{ field: 'reference', label: 'Transaction ID', required: true, missing: 'Enter the card transaction ID' }],
  Other: [{ field: 'modeDetail', label: 'Description', required: true, missing: 'Describe how the payment was made' }],
};

const MAX_LEN = { reference: 100, instrumentNumber: 50, bankName: 100, modeDetail: 200, receivedInto: 100 };
const blank = (v) => String(v ?? '').trim() === '';

export const blankPaymentForm = (today, extra = {}) => ({
  amount: '', method: 'Bank Transfer', reference: '', date: today, notes: '',
  instrumentNumber: '', instrumentDate: '', bankName: '', chequeStatus: 'Received', modeDetail: '', receivedInto: '',
  invoiceId: '', ...extra,
});

/**
 * `{ field: message }` for the mode's fields and the date (the amount is the
 * Gap 9 rule, checked with the form spec). `detailsOn`: 099 is applied.
 */
export const paymentDetailProblems = (form = {}, { today, detailsOn = true } = {}) => {
  const out = {};
  if (form.date && today && String(form.date) > String(today)) out.date = 'The payment date cannot be in the future';
  if (!form.date) out.date = 'Enter the payment date';
  if (!detailsOn) return out;
  const fields = MODE_FIELDS[form.method];
  if (!fields) { out.method = 'Choose the payment mode'; return out; }
  for (const f of fields) {
    if (f.required && blank(form[f.field])) out[f.field] = f.missing || `Enter the ${f.label.toLowerCase()}`;
    else if (MAX_LEN[f.field] && String(form[f.field] ?? '').trim().length > MAX_LEN[f.field]) out[f.field] = `${f.label} can be at most ${MAX_LEN[f.field]} characters`;
  }
  if (String(form.receivedInto ?? '').trim().length > MAX_LEN.receivedInto) out.receivedInto = `Received into can be at most ${MAX_LEN.receivedInto} characters`;
  return out;
};

/** The p_details sent to record_partner_payment (099): the chosen mode's fields only. */
export const paymentDetailsArg = (form = {}, proofPath = null) => {
  const keep = new Set((MODE_FIELDS[form.method] || []).map(f => f.field));
  const pick = (k) => (keep.has(k) && !blank(form[k]) ? String(form[k]).trim() : null);
  return {
    instrumentNumber: pick('instrumentNumber'),
    instrumentDate: pick('instrumentDate'),
    bankName: pick('bankName'),
    chequeStatus: form.method === 'Cheque' ? (form.chequeStatus || 'Received') : null,
    modeDetail: pick('modeDetail'),
    receivedInto: blank(form.receivedInto) ? null : String(form.receivedInto).trim(),
    proofPath: proofPath || null,
  };
};

/** The reference kept on the row: UTR / transaction ID / receipt; other modes have none. */
export const paymentReferenceArg = (form = {}) =>
  (MODE_FIELDS[form.method] || []).some(f => f.field === 'reference') && !blank(form.reference) ? String(form.reference).trim() : null;

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * A warning (never a refusal) when this UTR / transaction ID, or this cheque /
 * DD number, was already used on another payment. Null when not.
 */
export const duplicateReferenceWarning = (form = {}, payments = []) => {
  const usesRef = ['UPI', 'Bank Transfer', 'Card'].includes(form.method);
  const usesNo = ['Cheque', 'Demand Draft'].includes(form.method);
  const ref = usesRef ? norm(form.reference) : '';
  const no = usesNo ? norm(form.instrumentNumber) : '';
  if (!ref && !no) return null;
  const hit = (payments || []).find(p => (ref && norm(p.reference) === ref) || (no && norm(p.instrumentNumber) === no));
  if (!hit) return null;
  const what = ref ? `UTR / reference ${String(form.reference).trim()}` : `${form.method === 'Cheque' ? 'Cheque' : 'DD'} number ${String(form.instrumentNumber).trim()}`;
  const when = hit.date || hit.createdAt ? ` on ${new Date(hit.date || hit.createdAt).toLocaleDateString('en-IN')}` : '';
  return `${what} was already used on payment ${hit.id}${when} (₹${Number(hit.amount || 0).toLocaleString('en-IN')}). Check it is not the same payment twice.`;
};

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Where a new payment goes, the way the database applies it (057/098): against
 * the chosen invoice, else the open invoices oldest first; anything left over
 * is held as advance credit. `open`: openInvoicesForParty's list.
 */
export const paymentAllocation = (amount, open = [], againstInvoiceId = null) => {
  let left = r2(amount);
  const lines = [];
  const targets = againstInvoiceId ? open.filter(o => o.id === againstInvoiceId) : open;
  for (const o of targets) {
    if (left <= 0) break;
    const applied = r2(Math.min(left, o.due));
    left = r2(left - applied);
    lines.push({ id: o.id, orderId: o.orderId || null, applied, fullyPaid: applied >= r2(o.due) - 0.005, dueAfter: r2(o.due - applied) });
  }
  return { lines, advance: left > 0.005 ? left : 0 };
};

/** The preview sentence for paymentAllocation. */
export const allocationText = (amount, open = [], againstInvoiceId = null) => {
  if (!(Number(amount) > 0)) return '';
  if (!againstInvoiceId && open.length === 0) return 'No outstanding invoices. This payment will be saved as an advance (credit balance).';
  const { lines, advance } = paymentAllocation(amount, open, againstInvoiceId);
  const parts = lines.map(l => `${l.id}${l.orderId ? ` (${l.orderId})` : ''} ${l.fullyPaid ? 'fully paid' : `${rupees(l.applied)} partly paid, ${rupees(l.dueAfter)} still due`}`);
  const head = `${rupees(amount)} → ${parts.join(', ') || 'no invoice'}`;
  return advance > 0 ? `${head}; ${rupees(advance)} extra becomes advance credit.` : `${head}.`;
};

/** "UPI (Ref: X)", "Cheque 000123, SBI, 12/10/2026 — Bounced", … or "Not recorded". */
export const paymentModeText = (p = {}) => {
  const method = p.method && p.method !== 'Invoice settled' ? p.method : null;
  if (!method) return 'Not recorded';
  if (method === 'Cheque' || method === 'Demand Draft') {
    const bits = [p.instrumentNumber, p.bankName, p.instrumentDate ? new Date(p.instrumentDate).toLocaleDateString('en-IN') : null].filter(Boolean);
    return `${method}${bits.length ? ` ${bits.join(', ')}` : ' (details not recorded)'}${p.chequeStatus ? ` — ${p.chequeStatus}` : ''}`;
  }
  if (method === 'Other') return p.modeDetail ? `Other: ${p.modeDetail}` : 'Other';
  return method;
};

/** The reference shown for a payment: UTR / transaction / receipt, or the cheque / DD number. */
export const paymentReferenceText = (p = {}) => {
  if (p.method === 'Cheque' || p.method === 'Demand Draft') return p.instrumentNumber || p.reference || 'Not recorded';
  return p.reference || 'Not recorded';
};

const partyIdOf = (row) => row?.distributorId || row?.dealerId || row?.retailerId || null;
const tiedInvoiceOf = (p, invoiceIds) => {
  if (p.invoiceId) return p.invoiceId;
  const m = typeof p.id === 'string' && p.id.startsWith('PAY-INV-') ? p.id.slice(8) : null;
  if (!m) return null;
  if (invoiceIds.has(m)) return m;
  const base = m.replace(/-\d+$/, '');
  return invoiceIds.has(base) ? base : null;
};

/**
 * Which invoices each of one partner's payments paid, the way the database
 * counts them (057/098): a payment tied to an invoice (PAY-INV-<id> or its
 * invoiceId) pays that one; the rest pay the open invoices oldest first, in
 * the order they were received; what is left is advance credit. A view for
 * the ledger and the invoice history — the invoice status is the database's.
 *
 * Answers Map(paymentId → { applied: [{ invoiceId, orderId, amount }], advance }).
 */
export const paymentApplications = (partyId, invoices = [], payments = [], creditNotes = [], invoiceOwner = (inv) => partyIdOf(inv)) => {
  const mine = (invoices || []).filter(inv => invoiceOwner(inv) === partyId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  const ids = new Set(mine.map(i => i.id));
  const remaining = new Map(mine.map(i => [i.id, invoiceTotal(i)]));
  const out = new Map();
  const pays = (payments || []).filter(p => partyIdOf(p) === partyId)
    .sort((a, b) => String(a.date || a.createdAt || '').localeCompare(String(b.date || b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));

  // Explicit first: tied payments and credit notes against an invoice.
  for (const c of (creditNotes || [])) {
    if (partyIdOf(c) === partyId && c.invoiceId && remaining.has(c.invoiceId)) {
      remaining.set(c.invoiceId, Math.max(r2(remaining.get(c.invoiceId) - Number(c.amount || 0)), 0));
    }
  }
  const pool = [];
  for (const p of pays) {
    const tied = tiedInvoiceOf(p, ids);
    if (!tied) { pool.push(p); continue; }
    const left = remaining.get(tied) || 0;
    const amount = r2(Math.min(Number(p.amount || 0), left));
    remaining.set(tied, r2(left - amount));
    const inv = mine.find(i => i.id === tied);
    out.set(p.id, { applied: amount > 0 ? [{ invoiceId: tied, orderId: inv?.orderId || null, amount }] : [], advance: r2(Number(p.amount || 0) - amount) });
  }
  // Untied credit notes join the pool before payments, as money already held.
  let held = (creditNotes || []).filter(c => partyIdOf(c) === partyId && !(c.invoiceId && remaining.has(c.invoiceId)))
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  for (const inv of mine) {
    if (held <= 0) break;
    const take = r2(Math.min(held, remaining.get(inv.id)));
    remaining.set(inv.id, r2(remaining.get(inv.id) - take));
    held = r2(held - take);
  }
  for (const p of pool) {
    let left = r2(Number(p.amount || 0));
    const applied = [];
    for (const inv of mine) {
      if (left <= 0) break;
      const due = remaining.get(inv.id);
      if (due <= 0.005) continue;
      const take = r2(Math.min(left, due));
      remaining.set(inv.id, r2(due - take));
      left = r2(left - take);
      applied.push({ invoiceId: inv.id, orderId: inv.orderId || null, amount: take });
    }
    out.set(p.id, { applied, advance: left > 0.005 ? left : 0 });
  }
  return out;
};

/** The ledger line for a payment (Gap 8). */
export const paymentLedgerText = (p = {}, application = null) => {
  const mode = paymentModeText(p);
  const via = mode === 'Not recorded' ? ' (mode not recorded)' : ` via ${mode}`;
  const ref = ['Cheque', 'Demand Draft'].includes(p.method) ? '' : (p.reference && p.reference !== p.invoiceId && !String(p.id || '').startsWith(`PAY-INV-${p.reference}`) ? ` (Ref: ${p.reference})` : '');
  const applied = application?.applied || [];
  const advance = application ? application.advance : 0;
  if (application && applied.length === 0) return `Advance received${via}${ref}`;
  const to = applied.map(a => `${a.invoiceId}${a.orderId ? ` (${a.orderId})` : ''}`).join(', ');
  return `Payment received${via}${ref}${to ? ` – applied to ${to}` : ''}${advance > 0 ? `; ${rupees(advance)} advance` : ''}`;
};

/** Names already used for "Received into", for the suggestions list. */
export const receivedIntoSuggestions = (payments = []) =>
  [...new Set((payments || []).map(p => String(p.receivedInto ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/**
 * paymentApplications for every partner at once: by payment, and by invoice
 * ([{ paymentId, amount }]) for the invoice history and the exports.
 */
export const applicationsForAll = (invoices = [], payments = [], creditNotes = [], invoiceOwner = (inv) => partyIdOf(inv)) => {
  const parties = new Set([...(invoices || []).map(invoiceOwner), ...(payments || []).map(partyIdOf)].filter(Boolean));
  const byPayment = new Map();
  const byInvoice = new Map();
  for (const party of parties) {
    for (const [paymentId, app] of paymentApplications(party, invoices, payments, creditNotes, invoiceOwner)) {
      byPayment.set(paymentId, app);
      for (const a of app.applied) {
        if (!byInvoice.has(a.invoiceId)) byInvoice.set(a.invoiceId, []);
        byInvoice.get(a.invoiceId).push({ paymentId, amount: a.amount });
      }
    }
  }
  return { byPayment, byInvoice };
};
