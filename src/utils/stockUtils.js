// Pure helpers behind the partner-facing Stock Availability screen.
// Kept free of React and Supabase imports so the arithmetic can be tested
// on its own — this is stock and money, and it should not be possible to
// change it without something failing loudly.

// Maps a portal role to the id field its records carry on shared tables.
export const PARTY_ID_FIELD = { Distributor: 'distributorId', Dealer: 'dealerId', Retailer: 'retailerId' };

/**
 * What has physically reached the partner from one order.
 *
 * Two rules matter here:
 *  - An order only counts once it has actually been delivered. Status used to
 *    be ignored entirely, so goods still sitting in the warehouse were reported
 *    as stock in hand.
 *  - A part-delivered order counts `deliveredQty`, not the full ordered
 *    quantity — an order for 500 with 350 shipped is 350 in the partner's hands.
 *    Partial delivery is only tracked for single-product orders, so a
 *    multi-item order contributes nothing until it is fully Delivered.
 */
export const receivedLines = (order) => {
  if (!order) return [];
  const multiItem = Array.isArray(order.items) && order.items.length > 0;

  if (order.status === 'Delivered') {
    return multiItem
      ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
      : [{ name: order.product, quantity: Number(order.quantity || 0) }];
  }
  if (order.status === 'Partially Delivered' && !multiItem) {
    return [{ name: order.product, quantity: Number(order.deliveredQty || 0) }];
  }
  return [];
};

/**
 * Totals delivered quantities per product for one party.
 *
 * Receipt confirmation does not gate the count — it is the partner's own
 * acknowledgement, not a fact about where the goods are — but unconfirmed
 * quantities are reported separately so the partner can act on them.
 *
 * `partyType` is the tier of the party being viewed, which is not always the
 * viewer's own role: staff can open this screen and select any party.
 */
export const aggregateReceived = (orders = [], party, partyType) => {
  const idField = PARTY_ID_FIELD[partyType];
  const byProduct = {};
  let totalUnits = 0, awaitingUnits = 0, orderCount = 0;

  if (!idField || !party?.id) return { byProduct, totalUnits, awaitingUnits, orderCount };

  orders
    .filter(o => o[idField] === party.id)
    .forEach(order => {
      const lines = receivedLines(order);
      if (lines.length === 0) return;
      orderCount += 1;
      const confirmed = Boolean(order.receivedByDistributor);
      lines.forEach(({ name, quantity }) => {
        if (!name || quantity <= 0) return;
        const entry = byProduct[name] || (byProduct[name] = { received: 0, unconfirmed: 0 });
        entry.received += quantity;
        totalUnits += quantity;
        if (!confirmed) { entry.unconfirmed += quantity; awaitingUnits += quantity; }
      });
    });

  return { byProduct, totalUnits, awaitingUnits, orderCount };
};
