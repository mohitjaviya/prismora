/**
 * Where stock goes when it moves.
 *
 * adjustStock, transferStock and receiveStock between them are every way a
 * quantity changes in this application, and none of the decisions they make
 * were reachable by a test: which batch receives goods, whether a transfer is
 * allowed, what the two sides of it end up holding.
 *
 * The rules they encode are not obvious and are worth stating plainly, because
 * getting one wrong moves real stock:
 *
 *   · a quantity never goes below zero -- there is no owing somebody minus
 *     four bottles, unlike a balance, which may legitimately be negative
 *   · goods received join an existing batch of the same product and batch
 *     number rather than starting a second row for it
 *   · a transfer moves between warehouses, so moving to the one the stock is
 *     already in is not a transfer
 *   · a transfer can never move more than the source holds, because the stock
 *     being moved has to exist
 */

/** A batch's quantity after an adjustment, floored at zero. */
export function quantityAfterAdjustment(quantity, adjustment) {
  const from = Number(quantity);
  const by = Number(adjustment);
  if (!Number.isFinite(from) || !Number.isFinite(by)) return null;
  return Math.max(0, from + by);
}

/** Batch numbers, compared the way receiving compares them. */
export function sameBatchNumber(a, b) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * The batch goods being received should join, if any.
 *
 * Product and batch number both have to match, ignoring case and surrounding
 * space, because the same batch arriving twice is one batch and not two. When
 * nothing matches, the caller starts a new row -- which is what stops a
 * delivery inheriting an unrelated batch's expiry date, a bug this codebase
 * has had before.
 */
export function batchToReceiveInto(inventory, product, batchNumber) {
  const name = String(product ?? '').trim().toLowerCase();
  if (!name) return null;
  return (inventory || []).find(i =>
    String(i?.product ?? '').trim().toLowerCase() === name
    && sameBatchNumber(i?.batchNumber, batchNumber)
  ) || null;
}

/**
 * Whether a transfer may go ahead, and why not when it may not.
 *
 * Returns { ok: true } or { ok: false, reason }. The reason exists so a screen
 * can say what was wrong instead of the button doing nothing, which is what
 * happens today -- transferStock returns early and silently on every one of
 * these.
 */
export function canTransfer(source, toWarehouse, qty) {
  if (!source) return { ok: false, reason: 'That batch no longer exists.' };

  const amount = Number(qty);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'Enter how many units to move.' };
  }

  const held = Number(source.quantity) || 0;
  if (amount > held) {
    return { ok: false, reason: `Only ${held} in this batch; cannot move ${amount}.` };
  }

  if (!toWarehouse) return { ok: false, reason: 'Choose a warehouse to move the stock to.' };
  if (source.warehouse === toWarehouse) {
    return { ok: false, reason: 'The stock is already in that warehouse.' };
  }

  return { ok: true };
}

/**
 * The batch at the destination that a transfer should merge into.
 *
 * Same product, same batch number, the destination warehouse, and not the row
 * being moved from. Null means the transfer creates a row there instead.
 */
export function destinationBatch(inventory, source, toWarehouse) {
  if (!source) return null;
  return (inventory || []).find(i =>
    i?.product === source.product
    && i?.batchNumber === source.batchNumber
    && i?.warehouse === toWarehouse
    && i?.id !== source.id
  ) || null;
}

/**
 * What both sides hold after a transfer.
 *
 * Returned together rather than computed twice, because the two numbers have
 * to agree: whatever leaves the source arrives at the destination, and a
 * transfer that changed the total held would be creating or destroying stock.
 */
export function applyTransfer(source, destination, qty) {
  const amount = Number(qty) || 0;
  return {
    from: (Number(source?.quantity) || 0) - amount,
    to: (Number(destination?.quantity) || 0) + amount,
  };
}
