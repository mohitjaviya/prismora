/**
 * GSTIN, phone and pincode formats for partners and vendors.
 *
 * The same rules are in the database (078, `partner_contact_checks`), which
 * checks a field only when it is entered or changed: some old rows hold test
 * values that would fail, and a rule on every update would also refuse the
 * balance triggers that touch those rows. These copies only save a round-trip
 * and give a clear sentence next to the form. Every field is optional here;
 * a form that requires one says so itself.
 */

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
// After dropping spaces and dashes: a 10-digit mobile (6–9 first) with an
// optional +91, 91 or 0 in front, or an 11-digit landline starting with 0.
const MOBILE_RE = /^(\+91|91|0)?[6-9][0-9]{9}$/;
const LANDLINE_RE = /^0[1-9][0-9]{9}$/;
export const PINCODE_RE = /^[1-9][0-9]{5}$/;

const blank = (v) => !String(v ?? '').trim();

export const normaliseGstin = (v) => String(v ?? '').trim().toUpperCase();

export function gstinProblem(v) {
  if (blank(v)) return null;
  return GSTIN_RE.test(normaliseGstin(v))
    ? null
    : 'GSTIN must be 15 characters, like 24AAACJ1234K1Z5 (2-digit state code, PAN, entity number, Z, check character).';
}

export function phoneProblem(v) {
  if (blank(v)) return null;
  const s = String(v).replace(/[\s-]/g, '');
  return MOBILE_RE.test(s) || LANDLINE_RE.test(s)
    ? null
    : 'Phone must be a 10-digit mobile number starting 6–9 (+91 or 0 in front is fine), or an 11-digit landline starting with 0.';
}

export function pincodeProblem(v) {
  if (blank(v)) return null;
  return PINCODE_RE.test(String(v).trim()) ? null : 'Pincode must be 6 digits and cannot start with 0.';
}

/**
 * The first problem in a partner/vendor form, or null. With `before` (the row
 * being edited), a field left as it was is not checked — the database lets an
 * old value stand until someone changes it, and so does the form.
 */
export function contactProblem(form = {}, before = null) {
  const same = (f) => f === 'gstin'
    ? normaliseGstin(form[f]) === normaliseGstin(before[f])
    : String(form[f] ?? '') === String(before[f] ?? '');
  const changed = (f) => f in form && (!before || !same(f));
  return (changed('gstin') && gstinProblem(form.gstin))
    || (changed('phone') && phoneProblem(form.phone))
    || (changed('pincode') && pincodeProblem(form.pincode))
    || null;
}
