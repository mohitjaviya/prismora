// One real GRN, end to end (owner's request): TEST Warehouse Manager records 1 unit on TEST-PO-1 in the browser,
// the DB writes the 'grn' movement row; then TEST Purchase Manager deletes the GRN (082 takes the unit back out,
// vendor and PO status go back) and TEST Warehouse removes the empty batch. Every step confirmed in the DB.
// Run from Git Bash: CHROME_ARGS=--disable-quic node ui.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { login, go, assertNotIntercepting, E } from '../phase3/lib.mjs';

const ENV = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const as = async (who) => { const c = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: E[`TEST_${who}_EMAIL`], password: E[`TEST_${who}_PASSWORD`] }); if (error) throw error; return c; };
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim()); };
const one = (sql) => db(sql)[0];
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 1000)); } return null; };

const BATCH = 'TEST-B15C-UI';
const snap = () => one(`SELECT (SELECT status FROM purchase_orders WHERE id='TEST-PO-1')||' / vendor '||(SELECT "outstandingAmount" FROM vendors WHERE id='TEST-V-1')||' / batches '||(SELECT count(*) FROM inventory WHERE "batchNumber"='${BATCH}')||' / grns '||(SELECT count(*) FROM grn WHERE "poId"='TEST-PO-1')||' / units '||(SELECT sum(quantity) FROM inventory)`);
const before = snap();
console.log('before:', before);

// 1. Record the GRN in the browser as TEST Warehouse Manager
const page = await login('WAREHOUSE');
await go(page, '/purchases');
await page.locator('tr', { hasText: 'TEST-PO-1' }).first().locator('button', { hasText: 'GRN' }).click();
await page.waitForTimeout(800);
await page.fill('#purchases-qty-received', '1');
await page.fill('#purchases-batch', BATCH);
await page.fill('#purchases-expiry', '2028-01-31');
await page.locator('button[type="submit"]', { hasText: 'Record GRN' }).click();
const grnId = await waitFor(() => one(`SELECT id FROM grn WHERE "poId"='TEST-PO-1' AND items::text LIKE '%${BATCH}%'`));
check(!!grnId, `G1 GRN recorded in the browser: ${grnId}`);
const mv = one(`SELECT kind||' '||quantity||' '||"createdBy"||' '||note||' batch '||"batchNumber" FROM stock_movements WHERE "grnId"='${grnId}'`);
check(mv === `grn 1 U-TEST-WAREHOUSE goods receipt ${grnId} (TEST-PO-1) batch ${BATCH}`, `G2 movement row written: ${mv}`);
const mid = snap();
check(/^Partially Received \/ vendor 4909\.00 \/ batches 1 \/ grns 1 /.test(mid), `G3 after receipt: ${mid}`);
check(one(`SELECT quantity||' '||"expiryDate"::date FROM inventory WHERE "batchNumber"='${BATCH}'`) === '1 2028-01-31', 'G4 batch holds 1, expiry 2028-01-31');
await page.context().browser().close();

// 2. Undo: Purchase Manager deletes the GRN (082 takes the unit back out), Warehouse removes the empty batch
const pm = await as('PURCHASE_MANAGER');
const d = await pm.from('grn').delete().eq('id', grnId).select('id');
check(!d.error && d.data?.length === 1, `U1 Purchase Manager deleted ${grnId}${d.error ? ': ' + d.error.message : ''}`);
const rev = one(`SELECT kind||' '||quantity||' '||"createdBy" FROM stock_movements WHERE "grnId"='${grnId}' AND kind='grn_reversed'`);
check(rev === 'grn_reversed 1 U-TEST-PURCHASE-MANAGER', `U2 reversal movement: ${rev}`);
check(one(`SELECT quantity FROM inventory WHERE "batchNumber"='${BATCH}'`) === '0', 'U3 the unit is back out of the batch');
const wh = await as('WAREHOUSE');
const id = one(`SELECT id FROM inventory WHERE "batchNumber"='${BATCH}'`);
const r = await wh.from('inventory').delete().eq('id', id).select('id');
check(!r.error && r.data?.length === 1, 'U4 Warehouse removed the empty TEST batch');
const after = snap();
check(after === before, `U5 back to the start: ${after}`);
console.log(`\nGRN end to end: ${pass} pass, ${fail} fail`);
