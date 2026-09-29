/**
 * A form saved over someone else's change (B09).
 *
 * A form remembers the record's updatedAt (stamped by the database) when it
 * opens. The save only goes through if the record still has that stamp; if
 * not, these helpers say what the other person changed, so the user can
 * choose to overwrite it or take the latest version.
 */

export const LEAD_FIELDS = {
  name: 'Name', company: 'Company', email: 'Email', phone: 'Phone', productInterest: 'Products',
  dealValue: 'Deal value', leadSource: 'Source', leadType: 'Lead type', status: 'Status', state: 'State',
  city: 'City', territoryId: 'Territory', followUpDate: 'Follow-up', notes: 'Notes', assignedTo: 'Assigned to',
};

export const ORDER_FIELDS = {
  customerName: 'Customer', companyName: 'Company', phone: 'Phone', email: 'Email', product: 'Product',
  quantity: 'Quantity', value: 'Value', status: 'Status', state: 'State', city: 'City',
  deliveryAddress: 'Delivery address', deliveryPincode: 'Pincode', assignedTo: 'Assigned to', date: 'Order date',
};

const norm = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  const n = Number(v);
  return v !== '' && Number.isFinite(n) && /^-?[0-9.]+$/.test(String(v)) ? String(n) : String(v);
};
const show = (v) => {
  const s = Array.isArray(v) ? v.join(', ') : (v === null || v === undefined || v === '' ? '(empty)' : String(v));
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** What differs between the version the form started from and the one saved since. */
export function changedFields(base, current, fields) {
  return Object.entries(fields)
    .filter(([k]) => norm(base?.[k]) !== norm(current?.[k]))
    .map(([k, label]) => ({ field: k, label, from: show(base?.[k]), to: show(current?.[k]) }));
}

/** One sentence for the confirm dialog. */
export function describeConflict({ kind, who, at, changes }) {
  const time = at ? new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const list = changes.length
    ? changes.map(c => `${c.label}: "${c.from}" → "${c.to}"`).join('; ')
    : 'no field you can see changed, but the record was saved again';
  return `${who || 'Someone'} saved this ${kind}${time ? ` at ${time}` : ''}, after you opened it — ${list}. Overwrite it with your version, or load theirs and redo your change?`;
}
