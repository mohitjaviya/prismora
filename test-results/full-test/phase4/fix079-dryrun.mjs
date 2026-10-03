// Dry run for migration 079 (all rolled back): O5 + its sales return and credit note linked to Krishna pharma;
// O113 cancel as maintenance vs as Admin; what delivering O113 would do. Each step is tagged with app.via.
import { run } from './rolerun.mjs';
const K = 'DIST-1790265786389';
const VIA = (s) => `PERFORM set_config('app.via', '${s}', true)`;
const O5_FIX = [
  VIA('correction 079: order O5 linked to Krishna pharma (P4-F1)'), `UPDATE orders SET "distributorId"='${K}' WHERE id='O5' AND "distributorId" IS NULL`,
  VIA('correction 079: sales return SR-1790658148634 linked to Krishna pharma (P4-F1)'), `UPDATE sales_returns SET "distributorId"='${K}' WHERE id='SR-1790658148634' AND "distributorId" IS NULL`,
  VIA('correction 079: credit note CN-SR-1790658148634 linked to Krishna pharma (P4-F1)'), `UPDATE credit_notes SET "distributorId"='${K}' WHERE id='CN-SR-1790658148634' AND "distributorId" IS NULL`,
].map(s => `${s};`).join(' ');
const AFTER_O5 = `SELECT (SELECT "outstandingAmount" FROM distributors WHERE id='${K}') krishna,
  (SELECT status||' paid '||"amountPaid" FROM invoices WHERE id='INV-1790265113364') invoice,
  (SELECT "distributorId"||' / '||coalesce("assignedTo",'-')||' / '||coalesce("territoryId",'-')||' / '||status FROM orders WHERE id='O5') o5,
  (SELECT count(*) FROM distributor_incentives WHERE "orderId"='O5') incentives,
  (SELECT json_agg(json_build_object('t',table_name,'a',action,'who',coalesce(actor_name,'System'),'via',via)) FROM audit_log WHERE at=now()) audit`;
const steps = [
  { who: 'SQL', id: 'F1-o5-link', write: true, sql: `DO $x$ BEGIN ${O5_FIX} END $x$`, check: AFTER_O5 },
  { who: 'SQL', id: 'F2-o113-cancel-maintenance', write: true,
    sql: `DO $x$ BEGIN ${VIA('correction 079: duplicate TEST order O113 (lead L11) cancelled')}; UPDATE orders SET status='Cancelled' WHERE id='O113' AND status='Shipped'; END $x$`,
    check: `SELECT (SELECT status FROM orders WHERE id='O113') o113, (SELECT status||' '||amount||'+'||tax FROM invoices WHERE "orderId"='O113') inv,
      (SELECT json_agg(json_build_object('t',table_name,'a',action,'via',via)) FROM audit_log WHERE at=now()) audit` },
  { who: 'ADMIN', id: 'F3-o113-cancel-as-admin', write: true, sql: `UPDATE orders SET status='Cancelled' WHERE id='O113'` },
  { who: 'DISPATCH', id: 'F4-o113-deliver', write: true,
    setup: `UPDATE orders SET "deliveryAddress"='TEST address', "deliveryPincode"='411001' WHERE id='O113' AND coalesce("deliveryAddress",'')=''`,
    sql: `UPDATE orders SET status='Delivered' WHERE id='O113'`,
    check: `SELECT (SELECT count(*) FROM invoices WHERE "orderId"='O113') invoices_for_o113, (SELECT coalesce(sum(quantity),0) FROM stock_movements WHERE "orderId"='O113') units_moved` },
];
const out = run(steps);
for (const s of steps) console.log(`${s.id.padEnd(28)} ${out[s.id].ok ? 'OK     ' : 'REFUSED'} ${out[s.id].text.replace(/\\"/g, '"')}`);
