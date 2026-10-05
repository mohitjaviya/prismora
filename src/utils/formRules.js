/**
 * One set of input rules for every form (Gap 9): phone, email, quantity,
 * amount, percentage and required text.
 *
 * A form describes its fields once — `{ phone: { kind: 'mobile', label:
 * 'Phone' }, … }` — and gets back a message per field from `checkForm` and a
 * cleaned copy to save from `cleanForm` (all text trimmed, mobile numbers as
 * 10 digits, emails in lowercase). The same phone, email, quantity and amount
 * rules are in the database (094); these copies give the sentence under the
 * field before the round-trip.
 *
 * Old rows are not special: a record saved before these rules opens as it is,
 * and saving it asks for the bad field to be fixed.
 *
 * Partner/vendor GSTIN and pincode keep their own rules (`contactChecks.js`);
 * their phone uses the mobile rule here (no landlines).
 */

export const MOBILE_MESSAGE = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9 (+91 in front is fine)';

// Upper limits that catch typing mistakes (same numbers in migration 095).
export const MAX_QTY = 100000;
export const MAX_AMOUNT = 100000000; // ₹10 crore
const MAX_QTY_TEXT = '1,00,000';
const MAX_AMOUNT_TEXT = '₹10 crore';
export const EMAIL_MESSAGE = 'Enter a valid email address, like name@domain.com';

// The one mobile rule: 10 digits starting 6-9. Spaces and dashes are allowed
// for readability; +91, 91 or 0 may be in front. Saved as the plain 10 digits.
const MOBILE_RE = /^(?:\+91|91|0)?([6-9][0-9]{9})$/;
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export const isBlank = (v) => (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim());

const mobileDigits = (v) => String(v ?? '').replace(/[\s-]/g, '').match(MOBILE_RE)?.[1] ?? null;

/** A valid mobile as its 10 digits; anything else trimmed, as it was. */
export function normaliseMobile(v) {
  if (isBlank(v)) return '';
  return mobileDigits(v) ?? String(v).trim();
}

export function mobileProblem(v) {
  if (isBlank(v)) return null;
  return mobileDigits(v) ? null : MOBILE_MESSAGE;
}

export const normaliseEmail = (v) => String(v ?? '').trim().toLowerCase();

export function emailProblem(v) {
  if (isBlank(v)) return null;
  return EMAIL_RE.test(normaliseEmail(v)) ? null : EMAIL_MESSAGE;
}

export function requiredProblem(v, label = 'This field') {
  return isBlank(v) ? `${label} is required` : null;
}

const toNumber = (v) => (typeof v === 'number' ? v : Number(String(v).trim().replace(/,/g, '')));
const moreThanTwoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

/** Whole number above 0. Blank is "required": a quantity is never optional. */
export function quantityProblem(v, label = 'Quantity') {
  if (isBlank(v)) return `${label} is required`;
  const n = toNumber(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n <= 0) return `${label} must be more than 0`;
  if (!Number.isInteger(n)) return `${label} must be a whole number`;
  if (n > MAX_QTY) return `${label} cannot be more than ${MAX_QTY_TEXT}`;
  return null;
}

/** Whole number, 0 allowed (a goods-receipt line that brings nothing this time). */
export function countProblem(v, label = 'Quantity') {
  if (isBlank(v)) return null;
  const n = toNumber(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
  if (!Number.isInteger(n)) return `${label} must be a whole number`;
  if (n > MAX_QTY) return `${label} cannot be more than ${MAX_QTY_TEXT}`;
  return null;
}

/** Stock adjustment: a whole number, + or -, not 0, at most 1,00,000 either way. */
export function adjustmentProblem(v, label = 'Adjustment') {
  if (isBlank(v)) return `${label} is required`;
  const n = toNumber(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n === 0) return `${label} cannot be 0`;
  if (!Number.isInteger(n)) return `${label} must be a whole number`;
  if (Math.abs(n) > MAX_QTY) return `${label} cannot be more than ${MAX_QTY_TEXT} either way`;
  return null;
}

/**
 * Money: not negative, at most 2 decimals. `positive` also refuses 0 (a
 * payment or an expense); blank passes unless the form says it is required.
 */
export function amountProblem(v, label = 'Amount', { positive = false } = {}) {
  if (isBlank(v)) return null;
  const n = toNumber(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
  if (positive && n === 0) return `${label} must be more than 0`;
  if (moreThanTwoDecimals(n)) return `${label} can have at most 2 decimals`;
  if (n > MAX_AMOUNT) return `${label} cannot be more than ${MAX_AMOUNT_TEXT}`;
  return null;
}

/** Discount / tax %: 0–100, at most 2 decimals. */
export function percentProblem(v, label = 'Percentage') {
  if (isBlank(v)) return null;
  const n = toNumber(v);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0 || n > 100) return `${label} must be between 0 and 100`;
  if (moreThanTwoDecimals(n)) return `${label} can have at most 2 decimals`;
  return null;
}

const KIND_CHECKS = {
  text: () => null,
  mobile: (v) => mobileProblem(v),
  email: (v) => emailProblem(v),
  qty: (v, label) => quantityProblem(v, label),
  count: (v, label) => countProblem(v, label),
  adjustment: (v, label) => adjustmentProblem(v, label),
  amount: (v, label) => amountProblem(v, label),
  positiveAmount: (v, label) => amountProblem(v, label, { positive: true }),
  percent: (v, label) => percentProblem(v, label),
};

/**
 * `{ field: message }` for every field that breaks its rule (empty when the
 * form may be saved). Spec per field: `{ label, kind = 'text', required }`.
 */
export function checkForm(form = {}, spec = {}) {
  const errors = {};
  for (const [field, rule] of Object.entries(spec)) {
    if (!rule) continue;
    const { label = field, kind = 'text', required = false } = rule;
    const value = form?.[field];
    const problem = (required && kind !== 'qty' && kind !== 'adjustment' ? requiredProblem(value, label) : null)
      || (kind === 'qty' && !required && isBlank(value) ? null : KIND_CHECKS[kind]?.(value, label));
    if (problem) errors[field] = problem;
  }
  return errors;
}

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0;
export const firstError = (errors) => Object.values(errors || {})[0] || null;

/** Every top-level string trimmed; spec'd mobiles as 10 digits, emails lowercase. */
export function cleanForm(form = {}, spec = {}) {
  const out = {};
  for (const [k, v] of Object.entries(form)) out[k] = typeof v === 'string' ? v.trim() : v;
  for (const [field, rule] of Object.entries(spec)) {
    if (!rule || typeof out[field] !== 'string') continue;
    if (rule.kind === 'mobile') out[field] = normaliseMobile(out[field]);
    if (rule.kind === 'email') out[field] = normaliseEmail(out[field]);
  }
  return out;
}

/**
 * Problems in item lines (order, PO, return, GRN …): `{ index: { field:
 * message } }`. `spec` is the per-line field spec, as for `checkForm`.
 */
export function checkLines(lines = [], spec = {}) {
  const out = {};
  (lines || []).forEach((line, i) => {
    const e = checkForm(line, spec);
    if (hasErrors(e)) out[i] = e;
  });
  return out;
}

/** The same, flat — `{ 'items.1.quantity': message }` — to merge into a form's errors. */
export function lineFieldErrors(lines = [], spec = {}, prefix = 'items') {
  const out = {};
  for (const [i, e] of Object.entries(checkLines(lines, spec))) {
    for (const [field, msg] of Object.entries(e)) out[`${prefix}.${i}.${field}`] = msg;
  }
  return out;
}
