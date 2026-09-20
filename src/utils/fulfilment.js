/**
 * Splitting an order, and delivering part of one.
 *
 * Both take units off what a customer is waiting for, which makes them the two
 * places where an arithmetic slip loses goods somebody has paid for. Neither
 * had a test.
 *
 * The invariant that matters in both: units are conserved. A split moves them
 * between two orders and a partial delivery moves them between outstanding and
 * delivered. Nothing may create or destroy any along the way -- and nothing
 * else in the application would notice if it did.
 */

/**
 * How one order's lines divide into what ships now and what waits.
 *
 * `shipNow` names how many of each product to keep on the original. A product
 * not named falls back to what is actually in stock, which is what makes the
 * default behaviour "ship what you can".
 *
 * Returns { keep, split, conserved } -- conserved is the check, not a
 * decoration: it is false if the two halves do not add back up to what was
 * ordered, which is the failure worth catching rather than reasoning about.
 */
export function splitLines(lines = [], shipNow = null, availableFor = () => 0) {
  const keep = [];
  const split = [];

  for (const item of lines || []) {
    const ordered = Number(item?.quantity);
    if (!item?.name || !Number.isFinite(ordered) || ordered <= 0) continue;

    const named = shipNow && shipNow[item.name] !== undefined ? Number(shipNow[item.name]) : null;
    const requested = named !== null && Number.isFinite(named) ? named : Number(availableFor(item.name)) || 0;

    const keepQty = Math.min(ordered, Math.max(0, requested));
    const splitQty = ordered - keepQty;

    const unitPrice = Number(item.unitPrice)
      || (ordered ? (Number(item.total) || 0) / ordered : 0);

    if (keepQty > 0) keep.push({ ...item, quantity: keepQty, total: unitPrice * keepQty });
    if (splitQty > 0) split.push({ ...item, quantity: splitQty, total: unitPrice * splitQty });
  }

  const orderedTotal = (lines || []).reduce((sum, i) => {
    const q = Number(i?.quantity);
    return i?.name && Number.isFinite(q) && q > 0 ? sum + q : sum;
  }, 0);
  const resultTotal = [...keep, ...split].reduce((sum, i) => sum + i.quantity, 0);

  return { keep, split, conserved: orderedTotal === resultTotal };
}

/**
 * Whether a split is worth making.
 *
 * Both halves have to have something in them. Everything shipping now is not a
 * split, it is the order proceeding; nothing shipping now is not a split
 * either, it is the order waiting. Making a second order in either case leaves
 * an empty one behind for somebody to puzzle over.
 */
export function canSplit({ keep, split } = {}) {
  if (!keep?.length) return { ok: false, reason: 'Nothing can ship now, so there is nothing to split off.' };
  if (!split?.length) return { ok: false, reason: 'Everything can ship now, so there is nothing to hold back.' };
  return { ok: true };
}

/**
 * What a partial delivery moves, and whether it is allowed.
 *
 * `available` is unreserved stock. Delivering more than is held marks an order
 * Delivered and bills the customer for goods that never left the warehouse,
 * which the screen's `max` attribute does not prevent -- the input sits
 * outside a form, so the number can be typed past it.
 */
export function planPartialDelivery({ ordered, alreadyDelivered = 0, deliverNow, available = Infinity } = {}) {
  const total = Number(ordered) || 0;
  const done = Number(alreadyDelivered) || 0;
  const asked = Number(deliverNow);

  if (!Number.isFinite(asked) || asked <= 0) {
    return { ok: false, reason: 'Enter how many units are being delivered.' };
  }

  const nowDelivered = Math.min(total, done + asked);
  const moving = nowDelivered - done;

  if (moving <= 0) {
    return { ok: false, reason: 'Nothing left to deliver on this order.' };
  }
  if (moving > available) {
    return { ok: false, reason: `Only ${available} unit(s) in stock — cannot deliver ${moving}.` };
  }

  return {
    ok: true,
    moving,
    deliveredQty: nowDelivered,
    remaining: total - nowDelivered,
    status: nowDelivered >= total ? 'Delivered' : 'Partially Delivered',
  };
}
