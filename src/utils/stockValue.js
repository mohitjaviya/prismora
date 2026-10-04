import { isExpired } from './expiry';

// Gap 17: what the stock is worth at cost, split so that units that can never
// be sold are not counted as stock value. Damaged units sit in `damaged`, not
// in `quantity`; expired units stay in `quantity` until written off or sent
// back, so they are taken out here. Stock Value = sellable value only.
export function stockValueBreakdown(inventory = [], now = new Date()) {
  const t = { sellable: 0, expired: 0, damaged: 0, sellableUnits: 0, expiredUnits: 0, damagedUnits: 0 };
  for (const i of inventory) {
    const cost = Number(i.unitCost) || 0;
    const qty = Math.max(0, Number(i.quantity) || 0);
    const dmg = Math.max(0, Number(i.damaged) || 0);
    if (isExpired(i, now)) { t.expired += qty * cost; t.expiredUnits += qty; }
    else { t.sellable += qty * cost; t.sellableUnits += qty; }
    t.damaged += dmg * cost;
    t.damagedUnits += dmg;
  }
  return t;
}

// One batch's values, for the export.
export function batchValues(item, now = new Date()) {
  const cost = Number(item.unitCost) || 0;
  const qty = Math.max(0, Number(item.quantity) || 0);
  const expired = isExpired(item, now);
  return {
    sellable: expired ? 0 : qty * cost,
    expired: expired ? qty * cost : 0,
    damaged: Math.max(0, Number(item.damaged) || 0) * cost,
  };
}
