// Batch 15 gaps in the browser as TEST Warehouse Manager: the batch Edit form changes the warehouse of TEST-P3-B1
// (a recorded transfer of all of it), then moves it back. Each step confirmed in the DB.
// Run from Git Bash: CHROME_ARGS=--disable-quic node ui.mjs   (LIVE=1 BASE=https://… : read-only checks)
import { execSync } from 'node:child_process';
import { login, go, assertNotIntercepting } from '../phase3/lib.mjs';

const B1 = 'INV-ITEM-1791003427562-7c81';
const LIVE = !!process.env.LIVE;
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1); };
const one = (sql) => db(sql)[0]?.trim();
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const waitFor = async (fn, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 700)); } return null; };

const page = await login('WAREHOUSE');
const openEdit = async () => {
  await go(page, '/inventory');
  await page.fill('input[placeholder="Search product or batch"]', 'TEST Unrated Balm 25g');
  await page.waitForTimeout(800);
  await page.locator('tr', { hasText: 'TEST Unrated Balm 25g' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('tr', { hasText: 'TEST-P3-B1' }).first().locator('button[title="Edit"]').click();
  await page.waitForTimeout(500);
};
const state = () => one(`SELECT warehouse||' '||quantity FROM inventory WHERE id='${B1}'`);
const start = state();
console.log('B1 start', start);

await openEdit();
check(await page.locator('#inventory-warehouse').isEnabled(), 'V0 Edit form offers the warehouse');

if (!LIVE) {
  const qty = start.split(' ').pop();
  const lastMoves = () => db(`SELECT kind||' '||quantity||' '||"createdBy"||' '||note FROM stock_movements WHERE "inventoryId"='${B1}' ORDER BY id DESC LIMIT 2`).map(s => s.trim());
  for (const [to, id] of [['Secondary Warehouse', 'V1'], ['Main Warehouse', 'V2']]) {
    if (id === 'V2') await openEdit();
    await page.selectOption('#inventory-warehouse', to);
    await page.locator('button[type="submit"]', { hasText: 'Save Changes' }).click();
    // The toast first (it fades after a few seconds), then the database.
    const toast = await waitFor(async () => (await page.evaluate(() => document.body.innerText)).includes(`moved to ${to}`));
    const moved = await waitFor(() => state() === `${to} ${qty}`);
    check(!!moved, `${id} Edit form warehouse -> ${to}: DB batch ${B1} now "${state()}" (same batch, nothing left behind)`);
    check(!!toast, `${id} success message names the move`);
    const mv = lastMoves();
    check(mv.length === 2 && mv.every(m => / U-TEST-WAREHOUSE transfer .*moved on the batch Edit form$/.test(m)) && mv.some(m => m.startsWith('transfer_in')) && mv.some(m => m.startsWith('transfer_out')),
      `${id} movement rows: ${mv.join(' | ')}`);
  }
  check(state() === start && db(`SELECT id FROM inventory WHERE "batchNumber"='TEST-P3-B1'`).length === 1, `back where it started: "${state()}", one TEST-P3-B1 batch`);
}
console.log(`\nUI: ${pass} pass, ${fail} fail`);
await page.context().browser().close();
