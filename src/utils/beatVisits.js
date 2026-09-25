/**
 * A beat's status, derived from what has been recorded at each of its outlets.
 *
 * Untouched while nothing has been recorded, in progress while some outlets
 * remain, and finished once every outlet has an outcome. A finished beat is
 * Completed only if at least one outlet was actually visited — a route of
 * closed shops is Not Visited, not covered.
 */
export const beatStatusFor = (outlets, outletVisits) => {
  const list = Array.isArray(outlets) ? outlets : [];
  const visits = outletVisits || {};
  const done = list.filter(o => visits[o]).length;
  if (done === 0) return 'Planned';
  if (done < list.length) return 'In Progress';
  return list.some(o => visits[o]?.outcome === 'Visited') ? 'Completed' : 'Not Visited';
};

/**
 * Log a visit at one outlet of a beat: the order (if one was taken), then the
 * report, then the outlet's outcome on the beat.
 *
 * The order is the guarantee. Each step runs only once the one before it has
 * been saved, so a beat cannot read "1/1 done" with no report behind it, and a
 * report cannot name an order the database never had. Both happened: the
 * report insert was refused with nothing checking, and later a refused order
 * still handed back an id that the report then pointed at.
 *
 * `addOrder` and `addVisitReport` return the saved id, or null when the
 * database refused it; `recordOutletOutcome` returns whether the beat saved.
 *
 * `savedOrderId` and `savedVisitId` are what an earlier attempt already saved.
 * Passing them back on a retry picks up where it stopped, without raising the
 * order or filing the report a second time.
 */
export const submitOutletVisit = async (
  { addOrder, addVisitReport, recordOutletOutcome },
  { order = null, report, beatId, outlet, reason, savedOrderId = null, savedVisitId = null },
) => {
  let orderId = savedOrderId;
  if (order && !orderId) {
    orderId = await addOrder(order);
    if (!orderId) {
      return {
        ok: false, orderId: null, visitId: null,
        error: 'The order could not be saved, so the visit was not filed. Untick "Order placed" to file the visit without it, or ask an admin about your access to orders.',
      };
    }
  }

  const visitId = savedVisitId || await addVisitReport({ ...report, orderId: orderId || null });
  if (!visitId) {
    return { ok: false, orderId, visitId: null, error: 'The visit report could not be saved, so the outlet was not marked done. Try again.' };
  }
  if (beatId && outlet) {
    const marked = await recordOutletOutcome(beatId, outlet, report.outcome, { visitId, reason });
    if (!marked) {
      return { ok: false, orderId, visitId, error: 'The visit report was saved, but the beat could not be updated. Try again.' };
    }
  }
  return { ok: true, orderId, visitId, error: null };
};
