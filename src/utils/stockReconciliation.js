/**
 * Batch stock reconciliation (Gap 15): what each batch should hold according
 * to its stock_movements rows, against what it holds. Screen-only.
 *
 * A batch's history is complete only when every unit it ever held is in the
 * movement rows:
 *  - it has an opening-balance row (087 writes one per batch when applied and
 *    one for every batch added afterwards) — counted from that row on; or
 *  - it was created after RECORDS_COMPLETE_FROM by a movement (a GRN, a
 *    transfer or a sales return into a new batch).
 * Anything else is "history incomplete": its opening stock was never recorded,
 * so a difference would be invented, not found.
 */

// 081 applied (2026-10-03 17:56 UTC): from here GRNs write movement rows, and
// since 080 an app user can no longer change a quantity directly.
export const RECORDS_COMPLETE_FROM = '2026-10-03T17:56:03Z';
const CREATED_BY_MOVEMENT_WITHIN_MS = 10 * 60 * 1000;

const num = (v) => Number(v) || 0;
const time = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t; };

export const isNonSellableReturn = (m) => m?.kind === 'return' && (m.condition === 'Damaged' || m.condition === 'Expired');

/** How a movement row changes a batch: { qty, damaged }. Unknown kinds: null. */
export const movementEffect = (m) => {
  const q = num(m?.quantity);
  switch (m?.kind) {
    case 'opening': case 'grn': case 'transfer_in': case 'purchase_return_withdrawn': return { qty: q, damaged: 0 };
    case 'grn_reversed': case 'delivery': case 'transfer_out': case 'purchase_return': case 'free_goods': return { qty: -q, damaged: 0 };
    case 'adjustment': case 'cycle_count': return { qty: q, damaged: 0 }; // already signed
    case 'return': return isNonSellableReturn(m) ? { qty: 0, damaged: q } : { qty: q, damaged: 0 };
    case 'opening_damaged': return { qty: 0, damaged: q };
    case 'damaged_write_off': case 'damaged_to_vendor': return { qty: 0, damaged: -q };
    case 'return_reclassified': return { qty: -q, damaged: q }; // 089: earlier return corrected to damaged
    default: return null;
  }
};

export const MOVEMENT_LABELS = {
  opening: 'Opening balance', opening_damaged: 'Opening balance (damaged)', grn: 'Goods received (GRN)',
  grn_reversed: 'GRN deleted', delivery: 'Delivered on order', return: 'Sales return',
  purchase_return: 'Returned to vendor', purchase_return_withdrawn: 'Vendor return withdrawn',
  adjustment: 'Adjustment', cycle_count: 'Cycle count', transfer_out: 'Transferred out', transfer_in: 'Transferred in',
  free_goods: 'Free goods paid out', return_reclassified: 'Return corrected to damaged', damaged_write_off: 'Damaged written off', damaged_to_vendor: 'Damaged returned to vendor',
};

const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * One row per batch. Totals are always filled in; expected and difference
 * only when the history is complete.
 */
export const reconcileBatch = (batch, allMovements) => {
  const mine = (allMovements || []).filter(m => m.inventoryId === batch.id)
    .sort((a, b) => (time(a.at) ?? 0) - (time(b.at) ?? 0));
  const opening = mine.find(m => m.kind === 'opening' || m.kind === 'opening_damaged');
  let counted = mine;
  let complete = false;
  let note = '';
  if (opening) {
    const from = time(opening.at);
    counted = mine.filter(m => (time(m.at) ?? 0) >= from);
    complete = true;
    note = `Counted from the opening balance of ${fmtDay(opening.at)}`;
  } else {
    const created = time(batch.createdAt);
    const first = mine[0];
    const createdByMovement = first && ['grn', 'transfer_in', 'return'].includes(first.kind)
      && created !== null && Math.abs((time(first.at) ?? 0) - created) <= CREATED_BY_MOVEMENT_WITHIN_MS;
    if (created !== null && created >= time(RECORDS_COMPLETE_FROM) && createdByMovement) {
      complete = true;
    } else if (created === null || created < time(RECORDS_COMPLETE_FROM)) {
      note = `Batch created before ${fmtDay(RECORDS_COMPLETE_FROM)}: its opening stock was never recorded as a movement`;
    } else {
      note = 'Opening stock typed in on Add Batch is not recorded as a movement';
    }
  }

  const t = { opening: 0, received: 0, delivered: 0, returnedGood: 0, returnedDamaged: 0, adjustments: 0,
    transfers: 0, toVendor: 0, damagedOut: 0, freeGoods: 0, expectedQty: 0, expectedDamaged: 0 };
  const unknown = new Set();
  for (const m of counted) {
    const e = movementEffect(m);
    if (!e) { unknown.add(m.kind); continue; }
    const q = num(m.quantity);
    switch (m.kind) {
      case 'opening': case 'opening_damaged': t.opening += q; break;
      case 'grn': t.received += q; break;
      case 'grn_reversed': t.received -= q; break;
      case 'delivery': t.delivered += q; break;
      case 'return': if (isNonSellableReturn(m)) t.returnedDamaged += q; else t.returnedGood += q; break;
      case 'adjustment': case 'cycle_count': t.adjustments += q; break;
      case 'transfer_in': t.transfers += q; break;
      case 'transfer_out': t.transfers -= q; break;
      case 'purchase_return': t.toVendor += q; break;
      case 'purchase_return_withdrawn': t.toVendor -= q; break;
      case 'free_goods': t.freeGoods += q; break;
      case 'damaged_write_off': case 'damaged_to_vendor': t.damagedOut += q; break;
      // 089: units of an earlier return found damaged move from good to damaged.
      case 'return_reclassified': t.returnedGood -= q; t.returnedDamaged += q; break;
      default: break;
    }
    t.expectedQty += e.qty;
    t.expectedDamaged += e.damaged;
  }
  if (unknown.size) {
    complete = false;
    note = `Movement kind not understood by this report: ${[...unknown].join(', ')}`;
  }

  const actualQty = num(batch.quantity);
  const actualDamaged = num(batch.damaged);
  const qtyDiff = complete ? actualQty - t.expectedQty : null;
  const damagedDiff = complete ? actualDamaged - t.expectedDamaged : null;
  const status = !complete ? 'History incomplete' : (qtyDiff || damagedDiff ? 'Difference' : 'OK');
  return {
    id: batch.id, product: batch.product || '', batch: batch.batchNumber || '', warehouse: batch.warehouse || '',
    ...t,
    expectedQty: complete ? t.expectedQty : null,
    expectedDamaged: complete ? t.expectedDamaged : null,
    actualQty, actualDamaged, qtyDiff, damagedDiff, complete, status, note,
    movements: mine,
  };
};

export const reconcileAll = (inventory, movements) =>
  (inventory || []).map(b => reconcileBatch(b, movements))
    .sort((a, b) => a.product.localeCompare(b.product) || a.batch.localeCompare(b.batch));

/** Rows for the Excel export, columns in screen order. */
export const reconciliationExportRows = (rows) => rows.map(r => ({
  Product: r.product, Batch: r.batch, Warehouse: r.warehouse,
  Opening: r.opening, Received: r.received, Delivered: r.delivered,
  'Returned Good': r.returnedGood, 'Returned Damaged/Expired': r.returnedDamaged,
  Adjustments: r.adjustments, Transfers: r.transfers, 'To Vendor': r.toVendor, 'Free Goods': r.freeGoods,
  'Damaged Out': r.damagedOut,
  'Expected Qty': r.expectedQty, 'Actual Qty': r.actualQty, 'Qty Difference': r.qtyDiff,
  'Expected Damaged': r.expectedDamaged, 'Actual Damaged': r.actualDamaged, 'Damaged Difference': r.damagedDiff,
  Status: r.status, Note: r.note,
}));

export const RECONCILIATION_EXPORT_TYPES = Object.fromEntries(
  ['Opening', 'Received', 'Delivered', 'Returned Good', 'Returned Damaged/Expired', 'Adjustments', 'Transfers', 'To Vendor',
    'Free Goods', 'Damaged Out', 'Expected Qty', 'Actual Qty', 'Qty Difference', 'Expected Damaged', 'Actual Damaged',
    'Damaged Difference'].map(h => [h, 'number']));
