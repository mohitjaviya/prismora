/**
 * Reading the audit trail (040_audit_log_and_last_modified.sql).
 *
 * Every row there was written by the database itself, from the same function
 * that stamps "updatedBy" — so what this shows and what "Last changed by"
 * shows on a record cannot disagree.
 */

/** Who may open the Audit Log. The database enforces the same list. */
export const AUDIT_VIEWER_ROLES = ['Super Admin', 'Admin', 'Director'];
export const canViewAuditLog = (role) => AUDIT_VIEWER_ROLES.includes(role);

export const TABLE_LABELS = {
  orders: 'Order', invoices: 'Invoice', leads: 'Lead',
  purchase_orders: 'Purchase order', grn: 'Goods receipt', purchase_returns: 'Purchase return', vendors: 'Vendor',
  expenses: 'Expense', credit_notes: 'Credit note', distributor_payments: 'Partner payment',
  vendor_payments: 'Vendor payment', bank_transactions: 'Bank entry',
  distributors: 'Distributor', dealers: 'Dealer', retailers: 'Retailer',
  roles: 'Role permissions', users: 'User',
  inventory: 'Stock batch', stock_transfers: 'Stock transfer', products: 'Product',
  schemes: 'Scheme', scheme_claims: 'Scheme claim', distributor_incentives: 'Incentive',
  complaints: 'Complaint', territories: 'Territory', sfa_expenses: 'Field expense', attendance: 'Attendance',
  beat_plans: 'Beat plan', visit_reports: 'Visit report', beat_checkin_requests: 'Early check-in request',
};
export const tableLabel = (table) => TABLE_LABELS[table] || table;

/**
 * Who did it, for display.
 *
 * "System" only when the database had no person at all — a job, or a change
 * made directly in the database. A person is always named, even if their
 * account has since been deleted (the name was copied at the time).
 */
export function actorLabel(entry) {
  if (!entry?.actor_id) return { name: 'System', role: '', system: true };
  return { name: entry.actor_name || entry.actor_id, role: entry.actor_role || '', system: false };
}

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** The fields that changed, as [{ field, from, to }], for a "changed" row. */
export function changedFields(entry) {
  if (entry?.action !== 'changed' || !entry.changes) return [];
  return Object.entries(entry.changes).map(([field, pair]) => ({
    field,
    from: show(Array.isArray(pair) ? pair[0] : undefined),
    to: show(Array.isArray(pair) ? pair[1] : pair),
  }));
}

/** One line saying what happened, e.g. "status: Shipped → Delivered". */
export function summarise(entry) {
  if (!entry) return '';
  if (entry.action === 'created') return `Created ${tableLabel(entry.table_name).toLowerCase()} ${entry.row_id || ''}`.trim();
  if (entry.action === 'deleted') return `Deleted ${tableLabel(entry.table_name).toLowerCase()} ${entry.row_id || ''}`.trim();
  const fields = changedFields(entry);
  if (fields.length === 0) return 'Changed';
  return fields.map(f => `${f.field}: ${f.from} → ${f.to}`).join('; ');
}

/**
 * "Last changed by" for a record: its updatedBy/updatedAt, which the same
 * trigger writes. Null until 040 has stamped the row.
 */
export function lastChangedBy(record, users = []) {
  const id = String(record?.updatedBy ?? '').trim();
  if (!id || !record?.updatedAt) return null;
  const person = (users || []).find(u => u?.id === id);
  return { id, name: person?.name || id, at: record.updatedAt };
}
