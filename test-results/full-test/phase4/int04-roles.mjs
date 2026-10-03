// P4-INT-04 as real roles (all rolled back): each action's audit rows must name the signed-in user,
// even when the browser sends a forged updatedBy/createdBy; DB-driven follow-on rows carry a via tag.
import { run } from './rolerun.mjs';
const AUD = `SELECT table_name t, action a, actor_name who, actor_role role, via FROM audit_log WHERE at = now() ORDER BY id`;
const NEEM = 'TEST Neem Face Wash 100ml';
const steps = [
  { who: 'SALES_EXEC_1', id: 'A1-lead-forged-by', write: true,
    sql: `INSERT INTO leads(id,name,company,status,"createdBy","updatedBy","assignedTo") VALUES ('L-P4','TEST P4 Lead','TEST P4 Co','New','U-TEST-ADMIN','U-TEST-ADMIN','U-TEST-SALES-EXEC-1')`,
    check: `SELECT (SELECT "updatedBy" FROM leads WHERE name='TEST P4 Lead') row_by, x.* FROM (${AUD}) x` },
  { who: 'ACCOUNTS', id: 'A2-payment', write: true,
    sql: `INSERT INTO distributor_payments(id,"distributorId",amount,"createdAt","updatedBy") VALUES ('PAY-P4-1','D-TEST-2',100,now(),'U-TEST-ADMIN')`, check: AUD },
  { who: 'WAREHOUSE', id: 'A3-grn', write: true,
    sql: `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('GRN-P4','TEST-PO-1','TEST Herbal Raw Materials Co','[{"product":"${NEEM}","quantity":5,"receivedQty":5,"orderedQty":200,"unitCost":70,"batchNumber":"TEST-P4-GRN"}]'::jsonb, now())`, check: AUD },
  { who: 'DISTRIBUTOR', id: 'A4-portal-order', write: true,
    sql: `INSERT INTO orders("customerName",product,quantity,value,status,items,"distributorId","createdBy") VALUES ('TEST P4 portal','${NEEM}',2,1,'Pending','[{"name":"${NEEM}","quantity":2}]'::jsonb,'D-TEST-1','U-TEST-ADMIN')`, check: AUD },
  { who: 'ADMIN', id: 'A5-product-mrp', write: true, sql: `UPDATE products SET mrp = coalesce(mrp,0)+1 WHERE name='TEST Unrated Balm 25g'`, check: AUD },
  { who: 'PURCHASE_MANAGER', id: 'A6-vendor-payment', write: true,
    sql: `INSERT INTO vendor_payments(id,"vendorId",amount) VALUES ('VPAY-P4-1','TEST-V-1',10)`, check: AUD },
  { who: 'ACCOUNTS', id: 'A7-credit-note', write: true,
    sql: `INSERT INTO credit_notes(id,"invoiceId","customerName",amount,reason,"distributorId") VALUES ('CN-P4-1',NULL,'TEST P4',10,'Other','D-TEST-2')`, check: AUD },
  { who: 'DISPATCH', id: 'A8-ship-order', write: true, sql: `UPDATE orders SET status='Shipped' WHERE id='O56'`, check: AUD },
  { who: 'ADMIN', id: 'A9-masters-edit', write: true,
    sql: `INSERT INTO masters(id,list,key,label) VALUES ('M-TEST-P4','lead_source','TEST P4 Source','TEST P4 Source')`,
    check: `SELECT (SELECT count(*) FROM masters WHERE id='M-TEST-P4') saved, (SELECT count(*) FROM audit_log WHERE at=now()) audit_rows, (SELECT count(*) FROM events WHERE "timestamp" >= now()) events` },
  { who: 'ADMIN', id: 'A10-warehouse-edit', write: true, sql: `UPDATE warehouses SET location = coalesce(location,'') || ' ' WHERE id = (SELECT id FROM warehouses ORDER BY id LIMIT 1)`,
    check: `SELECT (SELECT count(*) FROM audit_log WHERE at=now()) audit_rows` },
  // P4-F1 still reachable? A new sales return on O5 (order has no partner, invoice does).
  { who: 'ACCOUNTS', id: 'A11-sales-return-O5', write: true,
    sql: `SELECT record_sales_return('O5','[{"product":"Aloevera Skin Gel 150g","quantity":1,"inventoryId":"INV-ITEM-1790056118706-tnhw"}]'::jsonb,'TEST P4 dry run')`,
    check: `SELECT c.id, c.amount, c."distributorId", (SELECT "outstandingAmount" FROM distributors WHERE id='DIST-1790265786389') krishna FROM credit_notes c WHERE c."createdAt" = now()` },
  // RISK-EVT: events from roles without Reports, actor stamped by the DB even when forged.
  { who: 'SALES_EXEC_1', id: 'E1-event-sales-exec', write: true,
    sql: `INSERT INTO events(id,type,message,"actorEmail") VALUES ('EV-P4-1','lead_created','TEST P4','someone.else@prismora.test')`,
    check: `SELECT "actorEmail" FROM events WHERE id='EV-P4-1'` },
  { who: 'DISTRIBUTOR', id: 'E2-event-partner', write: true,
    sql: `INSERT INTO events(id,type,message) VALUES ('EV-P4-2','order_created','TEST P4')`, check: `SELECT "actorEmail" FROM events WHERE id='EV-P4-2'` },
  { who: 'DISTRIBUTOR', id: 'E3-notification-partner', write: true,
    sql: `INSERT INTO notifications(id,"userId",type,title,message) VALUES ('NT-P4-1','U-TEST-ADMIN','info','TEST','TEST')` },
  { who: 'SALES_EXEC_1', id: 'E4-audit-tamper', write: true, sql: `DELETE FROM audit_log WHERE id = (SELECT max(id) FROM audit_log)` },
  { who: 'ADMIN', id: 'E5-audit-tamper-admin', write: true, sql: `UPDATE audit_log SET actor_name='x' WHERE id = (SELECT max(id) FROM audit_log)` },
];
const out = run(steps);
for (const s of steps) console.log(`${s.id.padEnd(26)} ${out[s.id].ok ? 'OK     ' : 'REFUSED'} ${out[s.id].text.replace(/\\"/g, '"')}`);
