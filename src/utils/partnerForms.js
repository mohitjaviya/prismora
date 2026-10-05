/**
 * Field rules for the dealer / distributor / retailer forms and their Record
 * Payment popup (Gap 9), in the shape `useFieldCheck` takes. GSTIN and pincode
 * keep their own rules (`contactChecks.js`): a value left as it was on an old
 * row is not asked for again, as in the database.
 */
import { gstinProblem, pincodeProblem, normaliseGstin } from './contactChecks';

/** `parentKey`: 'parentDistributorId' (dealers), 'parentDealerId' (retailers) or none (distributors). */
export function partnerSpec(parentKey) {
  return {
    name: { label: 'Company / business name', required: true },
    ...(parentKey ? { [parentKey]: { label: parentKey === 'parentDealerId' ? 'Parent dealer' : 'Parent distributor', required: true } } : {}),
    phone: { label: 'Phone', kind: 'mobile' },
    email: { label: 'Email', kind: 'email' },
    state: { label: 'State', required: true },
    pincode: { label: 'Pincode', required: true },
    address: { label: 'Delivery address', required: true },
    creditLimit: { label: 'Credit limit', kind: 'amount' },
  };
}

export const PARTNER_PAYMENT_SPEC = {
  amount: { label: 'Amount', kind: 'positiveAmount', required: true },
};

/** `{ gstin, pincode }` messages for a partner form; `before` is the row being edited (null on Add). */
export const partnerExtra = (before) => (form) => {
  const out = {};
  const changed = (f, same) => !before || !same(form[f], before[f]);
  const text = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
  const g = changed('gstin', (a, b) => normaliseGstin(a) === normaliseGstin(b)) ? gstinProblem(form.gstin) : null;
  const p = changed('pincode', text) ? pincodeProblem(form.pincode) : null;
  if (g) out.gstin = g;
  if (p) out.pincode = p;
  return out;
};
