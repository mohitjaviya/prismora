// Gap 18 (migration 090): every new or edited stock batch needs a batch number,
// and a number is used once per product (any warehouse, spaces and case
// ignored). Old batches keep what they have until edited; a batch whose number
// is not being changed is never refused for sharing it (abc123 ×3).
// The database refuses the same; this only says so before saving.

const norm = (v) => String(v ?? '').trim().toLowerCase();

export const BATCH_NUMBER_REQUIRED_TEXT = 'Give the batch number: every stock batch needs one.';

// form: { product, batchNumber }; original: the batch being edited (null on Add).
export function batchNumberProblem(form, inventory = [], original = null) {
  const batch = norm(form?.batchNumber);
  if (!batch) return BATCH_NUMBER_REQUIRED_TEXT;
  const product = norm(form?.product);
  const changed = !original || batch !== norm(original.batchNumber) || product !== norm(original.product);
  if (!changed) return null;
  const clash = inventory.find(i => i.id !== original?.id && norm(i.product) === product && norm(i.batchNumber) === batch);
  if (clash) {
    return `Batch number ${String(form.batchNumber).trim()} is already used for ${form.product}${clash.warehouse ? ` (${clash.warehouse})` : ''}. Each batch of a product needs its own number (to add units to that batch, use a goods receipt, Adjust or Transfer).`;
  }
  return null;
}

// Goods receipt: each line receiving units needs a batch number (it merges into
// the product's batch with that number, or creates it).
export function grnBatchProblem(items = []) {
  const line = items.find(i => String(i?.product ?? '').trim() && Number(i?.receivedQty) > 0 && !norm(i?.batchNumber));
  return line ? `Give the batch number for ${line.product}: every stock batch needs one.` : null;
}
