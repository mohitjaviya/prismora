// C7 partner confirms receipt (report only). The Confirm Receipt button calls confirm_my_order_receipt; a partner's own
// confirmation cannot be withdrawn in the app, so the write runs as the real partner inside a rolled-back transaction.
// The browser part only checks the button is offered on a delivered order (no click).
import { run } from '../phase4/rolerun.mjs';
import { login, go } from '../phase3/lib.mjs';

const R = `SELECT "receivedByDistributor" rec, "receivedAt" IS NOT NULL at_set, "receiptSource" src FROM orders WHERE id=`;
const steps = [
  { who: 'DISTRIBUTOR', id: 'R1-own-delivered-O100', write: true, sql: `SELECT confirm_my_order_receipt('O100')`, check: `${R}'O100'` },
  { who: 'DISTRIBUTOR', id: 'R2-twice', write: true, sql: `SELECT confirm_my_order_receipt('O100'); SELECT confirm_my_order_receipt('O100')`, check: `${R}'O100'` },
  { who: 'DISTRIBUTOR', id: 'R3-other-partner-O118', write: true, sql: `SELECT confirm_my_order_receipt('O118')`, check: `${R}'O118'` },
  { who: 'DISTRIBUTOR', id: 'R4-own-pending-O54', write: true, sql: `SELECT confirm_my_order_receipt('O54')`, check: `${R}'O54'` },
  { who: 'DISTRIBUTOR', id: 'R5-direct-update', write: true, sql: `UPDATE orders SET "receivedByDistributor"=true WHERE id='O101'`, check: `${R}'O101'` },
  { who: 'SALES_EXEC_1', id: 'R6-staff-calls-it', write: true, sql: `SELECT confirm_my_order_receipt('O100')`, check: `${R}'O100'` },
];
const out = run(steps);
for (const s of steps) console.log(`${s.id.padEnd(24)} ${out[s.id].ok ? 'OK     ' : 'REFUSED'} ${out[s.id].text.replace(/\\"/g, '"')}`);

const p = await login('DISTRIBUTOR'); await go(p, '/orders');
await p.locator('tr', { hasText: 'O100' }).first().click(); await p.waitForTimeout(1500);
const t = await p.evaluate(() => document.body.innerText);
console.log('browser: O100 detail offers "Confirm Receipt":', /Confirm Receipt/.test(t));
await p.context().browser().close();
