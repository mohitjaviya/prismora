// Fix batch 9: the screens, as the real roles, every outcome confirmed in the database.
// Usage: BASE=http://localhost:5174 node ui.mjs   (BASE defaults to local dev)
import { login, go, browser } from '../phase3/lib.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SCR = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/8f391113-5da9-47a3-91d8-276d5282ed17/scratchpad';
function db(sql) {
  const f = `${SCR}/ui9-${Date.now()}.sql`;
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f ${f} 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const toastText = async (page) => (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' | ');
const seenToasts = async (page, ms = 15000) => { let seen = ''; const end = Date.now() + ms; while (Date.now() < end) { const t = await toastText(page); if (t.trim() && !seen.includes(t)) seen += t + ' | '; if (/recorded|refused|at most|more than|cannot|withdrawn|payment or credit/i.test(seen)) break; await page.waitForTimeout(250); } return seen; };

const V = 'V1791003129329';
const state = () => db(`SELECT (SELECT "outstandingAmount" FROM vendors WHERE id='${V}') owed,
  (SELECT sum(quantity) FROM inventory WHERE "batchNumber" IN ('TEST-P3-B1','TEST-P3-B2')) held,
  (SELECT count(*) FROM purchase_returns WHERE "vendorId"='${V}') prs,
  (SELECT id FROM purchase_returns WHERE "vendorId"='${V}' ORDER BY "createdAt" DESC LIMIT 1) last`)[0];

// ── Purchase Manager: purchase returns ──
const s0 = state();
console.log('start:', JSON.stringify(s0));
let page = await login('PURCHASE_MANAGER');
await go(page, '/purchases');
await page.getByRole('button', { name: /^Returns/ }).click();
const openReturn = async (qty, cost) => {
  await page.getByRole('button', { name: 'Record Return' }).first().click();
  await page.selectOption('#purchases-vendor', V);
  await page.selectOption('#purchases-product', { label: 'TEST Unrated Balm 25g' }).catch(async () => page.selectOption('#purchases-product', 'TEST Unrated Balm 25g'));
  await page.fill('#purchases-quantity', String(qty));
  await page.fill('#purchases-unit-cost', String(cost));
  const t0 = Date.now();
  await page.locator('form button[type="submit"]', { hasText: 'Record Return' }).click();
  const seen = await seenToasts(page, 40000);
  console.log(`  (return of ${qty}: answer on screen after ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return seen;
};
let t = await openReturn(100000, 50); const s1 = state();
const stillOpen = await page.locator('#purchases-quantity').count();
check('U1 PM return 100,000 refused on screen and in DB', /more than TEST-P3 Vendor supplied/.test(t) && stillOpen === 1 && Number(s1.prs) === Number(s0.prs) && Number(s1.held) === Number(s0.held) && Number(s1.owed) === Number(s0.owed),
  `toast "${t.slice(0, 140)}"; form open=${stillOpen}; DB returns ${s0.prs}->${s1.prs}, held ${s0.held}->${s1.held}, owed ${s0.owed}->${s1.owed}`);
await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {});

// The DB answer may land after the toast: wait for it rather than read too early.
const waitState = async (pred) => { let s; for (let i = 0; i < 8; i++) { s = state(); if (pred(s)) return s; await page.waitForTimeout(2500); } return s; };
const withdraw = async (id) => {
  await go(page, '/purchases');
  await page.getByRole('button', { name: /^Returns/ }).click();
  await page.locator('tr', { hasText: id }).locator('button[title="Withdraw this return"]').click();
  await page.getByRole('button', { name: 'Withdraw' }).last().click();
  return seenToasts(page);
};

t = await openReturn(2, 50);
const s2 = await waitState(s => Number(s.prs) === Number(s0.prs) + 1);
const mv = db(`SELECT coalesce(sum(quantity),0) q FROM stock_movements WHERE "returnId"='${s2.last}' AND kind='purchase_return'`)[0].q;
check('U2 PM return 2 @₹50 saved; DB took 2 units and ₹100', /recorded/.test(t) && Number(s2.prs) === Number(s0.prs) + 1 && Number(s2.held) === Number(s0.held) - 2 && Number(s2.owed) === Number(s0.owed) - 100 && Number(mv) === 2,
  `toast "${t.slice(0, 100)}"; ${s2.last}; held ${s0.held}->${s2.held}; owed ${s0.owed}->${s2.owed}; movements ${mv}`);

if (s2.last && s2.last.startsWith('PR-')) {
  t = await withdraw(s2.last);
  const s3 = await waitState(s => Number(s.prs) === Number(s0.prs));
  check('U3 PM withdraws it: exactly 2 back, ₹100 back, row gone', /withdrawn/.test(t) && Number(s3.prs) === Number(s0.prs) && Number(s3.held) === Number(s0.held) && Number(s3.owed) === Number(s0.owed),
    `toast "${t.slice(0, 80)}"; held ->${s3.held}; owed ->${s3.owed}; returns ${s3.prs}`);
} else check('U3 PM withdraws it', false, 'no return id to withdraw');

// Leftover from the first, interrupted run (PR-1791016358088: 2 units, ₹100): withdrawn the same way.
const left = db(`SELECT id FROM purchase_returns WHERE "vendorId"='${V}' AND id LIKE 'PR-%'`).map(r => r.id);
for (const id of left) {
  t = await withdraw(id);
  console.log(`  cleanup: withdrew ${id} — "${t.slice(0, 60)}"`);
}
const sEnd = await waitState(s => Number(s.prs) === 0);
check('U3b TEST-P3 vendor back to the start of the batch (owed ₹400, B1+B2 = 10, no returns)', Number(sEnd.owed) === 400 && Number(sEnd.held) === 10 && Number(sEnd.prs) === 0,
  JSON.stringify(sEnd));
console.log('  page problems:', page.problems.filter(p => !/HTTP 400 POST .*record_purchase_return/.test(p)).slice(0, 5));
await page.context().close();

// ── Accounts: credit note cap, invoice delete buttons ──
const PAID = 'INV-1790599464550', PF_PAY = 'INV-1790666261292';
const cns0 = db(`SELECT count(*) n FROM credit_notes`)[0].n;
page = await login('ACCOUNTS');
await go(page, '/accounting');
await page.getByRole('button', { name: 'Credit Note' }).first().click();
await page.selectOption('#accounting-against-invoice-optional', PAID);
await page.fill('#accounting-credit-amount', '5000');
await page.locator('form button[type="submit"]', { hasText: 'Issue Credit Note' }).click();
t = await seenToasts(page);
const cns1 = db(`SELECT count(*) n FROM credit_notes`)[0].n;
check('U4 Accounts ₹5,000 credit note on settled ₹1,180 invoice refused', /at most ₹0/.test(t) && Number(cns1) === Number(cns0), `toast "${t.slice(0, 140)}"; credit notes ${cns0}->${cns1}`);
await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {});
await page.context().close();

page = await login('ADMIN');
await go(page, '/accounting');
await page.getByRole('button', { name: /^Invoices \(/ }).click();
await page.waitForTimeout(1000);
const find = async (id) => { const box = page.getByPlaceholder('Search invoice, customer, order'); await box.fill(id); await page.waitForTimeout(1500); };
await find(PAID);
const taxRow = page.locator('tr', { hasText: PAID });
const taxDel = await taxRow.locator('button[title="Delete proforma"], button[title="Delete Invoice"]').count();
const taxRows = await taxRow.count();
check('U5 Admin: an issued tax invoice row has no Delete button', taxRows > 0 && taxDel === 0, `rows found ${taxRows}; delete buttons ${taxDel}`);
await find(PF_PAY);
const pfRow = page.locator('tr', { hasText: PF_PAY });
const pfRows = await pfRow.count();
if (pfRows) {
  await pfRow.locator('button[title="Delete proforma"]').first().click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  t = await seenToasts(page);
}
const pfLeft = db(`SELECT count(*) n FROM invoices WHERE id='${PF_PAY}'`)[0].n;
check('U6 Admin deletes a proforma with a payment: refused with the reason, still in DB', pfRows > 0 && /payment or credit note/.test(t) && Number(pfLeft) === 1, `rows found ${pfRows}; toast "${t.slice(0, 140)}"; in DB ${pfLeft}`);
await page.context().close();

await browser.close();
const bad = results.filter(r => !r).length;
console.log(`\n${results.length - bad}/${results.length} as required`);
process.exit(bad ? 1 : 0);
