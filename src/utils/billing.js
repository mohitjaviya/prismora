/**
 * What an order adds to a party's balance.
 *
 * This is the arithmetic that produced the ₹10,200 drift on Gujarat Super
 * Stockist. chargePartyForOrder added only `order.value` while the ledger
 * counted an invoice as amount plus tax -- so every invoiced order pushed the
 * stored balance and the derived one apart by exactly the GST on it. Nobody
 * caused it and nobody could see it without opening the ledger and adding the
 * column up by hand.
 *
 * It lives here now because it is the highest-risk arithmetic in the
 * application and it sat inside a closure in a 3,279-line provider where no
 * test could reach it.
 */

/** The rate for one product name, as a fraction. Unknown products are untaxed. */
export function gstRateFor(catalogue, productName) {
  const match = (catalogue || []).find(p => p?.name === productName);
  if (!match) return 0;
  const pct = Number(match.gstPct);
  return Number.isFinite(pct) ? pct / 100 : 0;
}

/**
 * The tax on an order, to the rupee.
 *
 * Per line where the order is itemised, because a single order mixes products
 * at different rates and taxing the total at one of them is wrong in both
 * directions. A line's own `total` is trusted when present -- it is what the
 * customer was shown -- and recomputed from quantity and price when it is not.
 *
 * Rounded once at the end rather than per line, so a five-line order does not
 * accumulate five half-rupee roundings.
 */
export function gstForOrder(order, catalogue) {
  if (!order) return 0;

  if (Array.isArray(order.items) && order.items.length > 0) {
    const total = order.items.reduce((sum, item) => {
      const lineTotal = Number(
        item?.total ?? (Number(item?.quantity || 0) * Number(item?.unitPrice || 0))
      );
      if (!Number.isFinite(lineTotal)) return sum;
      return sum + lineTotal * gstRateFor(catalogue, item?.name);
    }, 0);
    return Math.round(total);
  }

  const value = Number(order.value);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * gstRateFor(catalogue, order.product));
}

/**
 * What the party is billed: the goods plus the tax on them.
 *
 * The number that must match what the ledger shows, or the two drift apart.
 */
export function amountOwedForOrder(order, catalogue) {
  const value = Number(order?.value);
  return (Number.isFinite(value) ? value : 0) + gstForOrder(order, catalogue);
}

/**
 * Which party an order is charged to, and in what order of precedence.
 *
 * chargePartyForOrder checks distributor, then dealer, then retailer, and stops
 * at the first that is set. An order carrying two ids is charged once, to the
 * one highest up the chain -- which is a choice worth being able to see rather
 * than one buried in an if/else.
 */
export function partyForOrder(order) {
  if (!order) return null;
  if (order.distributorId) return { kind: 'distributor', id: order.distributorId };
  if (order.dealerId) return { kind: 'dealer', id: order.dealerId };
  if (order.retailerId) return { kind: 'retailer', id: order.retailerId };
  return null;
}

/**
 * A balance after an order is charged to it.
 *
 * Rounded to paise. Unlike a payment this only ever increases, so there is no
 * negative case to reason about -- an order cannot bill a negative amount
 * without the value itself being negative, which is a different bug.
 */
export function balanceAfterCharge(outstanding, owed) {
  return Math.round(((Number(outstanding) || 0) + (Number(owed) || 0)) * 100) / 100;
}

/**
 * An order's lines: one per item on an itemised order, one for the whole
 * order otherwise. The same shape the database gives an invoice's lines.
 */
export function orderLines(order) {
  if (!order) return [];
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map(item => ({
      name: item?.name,
      quantity: Number(item?.quantity || 0),
      amount: Number(item?.total ?? (Number(item?.quantity || 0) * Number(item?.unitPrice || 0))) || 0,
    }));
  }
  return [{ name: order.product, quantity: Number(order.quantity || 0), amount: Number(order.value) || 0 }];
}

/**
 * The products on an order with no GST rate in the catalogue.
 *
 * gstForOrder taxes an unknown product at nothing, which is right for a
 * preview and wrong for a GST invoice: the manual form used to fill the gap
 * with a flat 18%, and a missing rate is now a reason to stop, not to guess.
 */
export function productsMissingGst(order, catalogue) {
  const missing = orderLines(order)
    .filter(line => {
      const match = (catalogue || []).find(p => p?.name === line.name);
      const pct = match ? Number(match.gstPct) : NaN;
      return !match || match.gstPct === null || match.gstPct === '' || !Number.isFinite(pct);
    })
    .map(line => line.name || '(unnamed product)');
  return [...new Set(missing)];
}

/** An invoice's type, as shown to people. A proforma is never a tax invoice. */
export const invoiceTypeLabel = (invoice) =>
  invoice?.invoiceType === 'auto_draft' ? 'Proforma – not a tax invoice' : 'Tax invoice';

export const isProforma = (invoice) => invoice?.invoiceType === 'auto_draft';
