// RISK-EXP as the real Dispatch role (all rolled back): a TEST order is set up as Shipped by the SQL role,
// then Dispatch marks it Delivered. Expired batches must never be taken; a shortfall of sellable stock is refused.
import { run } from './rolerun.mjs';
const ALOE = 'Aloevera Skin Gel 150g', LAV = 'Lavender Body Wash';
const order = (id, product, qty) => // the DB numbers orders itself, so each TEST order is found by its customer name (= id)
 
  `INSERT INTO orders(id,"customerName",product,quantity,value,status,items,"distributorId","deliveryAddress","deliveryPincode") VALUES ('${id}','${id}','${product}',${qty},${qty * 100},'Shipped','[]'::jsonb,'D-TEST-1','TEST P4 address','411001')`;
const MOVES = (id) => `SELECT m."inventoryId", m."batchNumber", m.quantity, i."expiryDate"::date exp, public.batch_is_sellable(i."expiryDate") sellable,
  (SELECT count(*) FROM invoices WHERE "orderId"=(SELECT id FROM orders WHERE "customerName"='${id}')) invoices FROM stock_movements m JOIN inventory i ON i.id=m."inventoryId" WHERE m."orderId"=(SELECT id FROM orders WHERE "customerName"='${id}')`;
const steps = [
  { who: 'DISPATCH', id: 'X1-aloe-30-over-sellable', setup: order('O-P4-X1', ALOE, 30), write: true,
    sql: `UPDATE orders SET status='Delivered' WHERE "customerName"='O-P4-X1'`, check: MOVES('O-P4-X1') },
  { who: 'DISPATCH', id: 'X2-aloe-5-within-sellable', setup: order('O-P4-X2', ALOE, 5), write: true,
    sql: `UPDATE orders SET status='Delivered' WHERE "customerName"='O-P4-X2'`, check: MOVES('O-P4-X2') },
  { who: 'DISPATCH', id: 'X3-lavender-29-all-sellable', setup: order('O-P4-X3', LAV, 29), write: true,
    sql: `UPDATE orders SET status='Delivered' WHERE "customerName"='O-P4-X3'`, check: MOVES('O-P4-X3') },
  { who: 'DISPATCH', id: 'X4-lavender-30-needs-expired', setup: order('O-P4-X4', LAV, 30), write: true,
    sql: `UPDATE orders SET status='Delivered' WHERE "customerName"='O-P4-X4'`, check: MOVES('O-P4-X4') },
  // Other ways into expired stock: a stock transfer/adjust is a browser write of an absolute quantity.
  { who: 'WAREHOUSE', id: 'X5-edit-expired-batch-expiry', write: true,
    sql: `UPDATE inventory SET "expiryDate" = now() + interval '365 days' WHERE id='INV-ITEM-1790621555217'`,
    check: `SELECT "expiryDate"::date, public.batch_is_sellable("expiryDate") sellable FROM inventory WHERE id='INV-ITEM-1790621555217'` },
  { who: 'WAREHOUSE', id: 'X6-add-batch-already-expired', write: true,
    sql: `INSERT INTO inventory(id,product,"batchNumber","expiryDate",quantity,warehouse,"unitCost",reserved,transit,damaged,"reorderLevel") VALUES ('INV-P4-X6','${LAV}','TEST-P4-OLD',now() - interval '30 days',50,'Main Warehouse',10,0,0,0,0)`,
    check: `SELECT id, quantity, public.batch_is_sellable("expiryDate") sellable FROM inventory WHERE id='INV-P4-X6'` },
  { who: 'WAREHOUSE', id: 'X7-grn-already-expired', write: true,
    sql: `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('GRN-P4-X7','TEST-PO-1','TEST Herbal Raw Materials Co','[{"product":"TEST Neem Face Wash 100ml","quantity":3,"receivedQty":3,"orderedQty":200,"unitCost":70,"batchNumber":"TEST-P4-X7","expiryDate":"2025-01-01"}]'::jsonb, now())`,
    check: `SELECT id, quantity, "expiryDate"::date, public.batch_is_sellable("expiryDate") sellable FROM inventory WHERE "batchNumber"='TEST-P4-X7'` },
];
const out = run(steps);
for (const s of steps) console.log(`${s.id.padEnd(30)} ${out[s.id].ok ? 'OK     ' : 'REFUSED'} ${out[s.id].text.replace(/\\"/g, '"')}`);
