// Fix batch 15 in the browser as TEST Warehouse Manager (real saves on TEST batches, each confirmed in the DB,
// then put back). Run from Git Bash: CHROME_ARGS=--disable-quic node ui.mjs   (LIVE=1 BASE=https://… : refusals only)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { login, go, assertNotIntercepting, E } from '../phase3/lib.mjs';

const ENV = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sb = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: E.TEST_WAREHOUSE_EMAIL, password: E.TEST_WAREHOUSE_PASSWORD });

const B1 = 'INV-ITEM-1791003427562-7c81', EXP = 'INV-ITEM-1790621555217';
const LIVE = !!process.env.LIVE;
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1); };
const one = (sql) => db(sql)[0];
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const waitFor = async (fn, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 700)); } return null; };

const page = await login('WAREHOUSE');
// Batches are listed in a pop-up opened from their product's row; start from a fresh page each time.
const PRODUCT = { 'TEST-P3-B1': 'TEST Unrated Balm 25g', 'TEST-P2-EXP-26592': 'Lavender Body Wash' };
const row = async (batch) => {
  await go(page, '/inventory');
  await page.fill('input[placeholder="Search product or batch"]', PRODUCT[batch]);
  await page.waitForTimeout(800);
  await page.locator('tr', { hasText: PRODUCT[batch] }).first().click();
  await page.waitForTimeout(800);
  return page.locator('tr', { hasText: batch }).first();
};
const toastText = () => page.evaluate(() => document.body.innerText);
const startQty = Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`));
console.log('B1 start', startQty);

// U1 Edit form: quantity read-only
await (await row('TEST-P3-B1')).locator('button[title="Edit"]').click();
check(await page.locator('#inventory-quantity').getAttribute('readonly') !== null, 'U1 Edit form shows quantity read-only');

// U2 Expired batch: expiry moved later -> refused with the database's reason, form stays, DB unchanged
const expBefore = one(`SELECT "expiryDate"::date FROM inventory WHERE id='${EXP}'`);
await (await row('TEST-P2-EXP-26592')).locator('button[title="Edit"]').click();
await page.fill('#inventory-expiry-date', '2027-12-31');
await page.locator('button[type="submit"]', { hasText: 'Save Changes' }).click();
const refusedExp = await waitFor(async () => /cannot be moved later or cleared/.test(await toastText()));
check(!!refusedExp && await page.locator('#inventory-expiry-date').count() === 1, 'U2 expired batch: later expiry refused with the reason, form left open');
check(one(`SELECT "expiryDate"::date FROM inventory WHERE id='${EXP}'`) === expBefore, `U2 DB expiry unchanged (${expBefore})`);

if (!LIVE) {
  // U3 Adjust +2
  await (await row('TEST-P3-B1')).locator('button[title="Adjust Stock"]').click();
  await page.fill('#inventory-adjustment-to-add-to-subtract', '2');
  await page.fill('#inventory-reason', 'TEST B15 UI found');
  await page.locator('button', { hasText: 'Apply Adjustment' }).click();
  const q3 = await waitFor(() => { const q = Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`)); return q === startQty + 2 ? q : null; });
  check(q3 === startQty + 2, `U3 Adjust +2: DB ${startQty} -> ${q3}`);
  check(one(`SELECT kind||' '||quantity||' '||"createdBy" FROM stock_movements WHERE "inventoryId"='${B1}' ORDER BY id DESC LIMIT 1`) === 'adjustment 2 U-TEST-WAREHOUSE', 'U3 movement row: adjustment 2 by TEST Warehouse');

  // U4 Adjust -100 -> refused, modal open
  await (await row('TEST-P3-B1')).locator('button[title="Adjust Stock"]').click();
  await page.fill('#inventory-adjustment-to-add-to-subtract', '-100');
  await page.fill('#inventory-reason', 'TEST B15 UI too many');
  await page.locator('button', { hasText: 'Apply Adjustment' }).click();
  const r4 = await waitFor(async () => /cannot go down by 100/.test(await toastText()));
  check(!!r4 && await page.locator('#inventory-reason').count() === 1, 'U4 Adjust -100: refused with the reason (no silent clamp), modal open');
  check(Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`)) === startQty + 2, 'U4 DB unchanged');

  // U5 Cycle Count back to the start
  await (await row('TEST-P3-B1')).locator('button[title="Cycle Count"]').click();
  await page.fill('#inventory-physically-counted-quantity', String(startQty));
  await page.locator('button', { hasText: 'Reconcile Count' }).click();
  const q5 = await waitFor(() => Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`)) === startQty);
  check(!!q5, `U5 Cycle Count to ${startQty}: DB matches`);
  check(one(`SELECT kind||' '||quantity FROM stock_movements WHERE "inventoryId"='${B1}' ORDER BY id DESC LIMIT 1`) === 'cycle_count -2', 'U5 movement row: cycle_count -2');

  // U6 Transfer 1 to Secondary Warehouse, then back (merges into B1)
  await (await row('TEST-P3-B1')).locator('button[title="Transfer to Warehouse"]').click();
  await page.selectOption('#inventory-destination-warehouse', 'Secondary Warehouse');
  await page.fill('#inventory-quantity-to-transfer-max', '1');
  await page.fill('#inventory-notes', 'TEST B15 UI');
  await page.locator('button[type="submit"]', { hasText: 'Transfer' }).click();
  const sec = await waitFor(() => { const r = db(`SELECT id FROM inventory WHERE "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse'`); return r.length ? r[0].trim() : null; });
  check(!!sec && Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`)) === startQty - 1, `U6 Transfer 1: Main ${startQty} -> ${startQty - 1}, new Secondary batch ${sec}`);
  await page.waitForTimeout(1500);
  check(await page.locator('tr', { hasText: 'Secondary Warehouse' }).count() >= 1, 'U6 new Secondary batch shown on screen without reload');
  // Put back as the same user through the same database operation (merges into B1), then remove the empty batch.
  const back = await sb.rpc('transfer_stock', { p_inventory_id: sec, p_to_warehouse: 'Main Warehouse', p_qty: 1, p_notes: 'TEST B15 UI put back' });
  const del = await sb.from('inventory').delete().eq('id', sec).select('id');
  check(!back.error && del.data?.length === 1 && Number(one(`SELECT quantity FROM inventory WHERE id='${B1}'`)) === startQty
    && db(`SELECT id FROM inventory WHERE "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse'`).length === 0,
    `cleanup: unit moved back (B1 = ${startQty}), empty Secondary batch removed`);
}
console.log(`\nUI: ${pass} pass, ${fail} fail`);
await page.context().browser().close();
