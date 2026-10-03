// Fix batch 13, part 2: single-click actions wait for the database; vendor-payment Withdraw; vendor delete
// refusal; Masters confirm; no Edit for view-only roles. Real roles, outcomes confirmed in the DB.
// Refusals are either real database refusals (vendor with a payment) or a refused response injected by
// Playwright (nothing reaches the server). Local only (LIVE unset): the scheme toggle is done for real on
// TEST scheme SCH-1790405906612 and put back.
// Usage (Git Bash): BASE=http://localhost:5174 node ui2.mjs ; LIVE=1 BASE=<live> node ui2.mjs
import { login, go, browser } from '../phase3/lib.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const LIVE = !!process.env.LIVE;
function db(sql) {
  const f = `${tmpdir()}/ui13b-${Date.now()}.sql`.replace(/\\/g, '/');
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}" 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
// Every toast text ever shown on the page (a short-lived toast can fall between two polls).
const toasts = async (page) => {
  await page.evaluate(() => {
    if (window.__toastLog) return;
    window.__toastLog = [];
    const grab = () => document.querySelectorAll('[role="status"]').forEach(el => { const t = el.innerText; if (t && !window.__toastLog.includes(t)) window.__toastLog.push(t); });
    new MutationObserver(grab).observe(document.body, { childList: true, subtree: true, characterData: true });
    grab();
  }).catch(() => {});
  return (await page.evaluate(() => (window.__toastLog || []).join(' | ')).catch(() => ''));
};
const toastMatching = async (page, re, tries = 40) => { let t = ''; for (let i = 0; i < tries && !re.test(t); i++) { await page.waitForTimeout(500); t = await toasts(page); } return t; };
const REFUSAL = 'TEST B13b simulated refusal';
const refuseWrites = async (page, table, methods = ['POST', 'PATCH', 'DELETE']) => {
  let hits = 0;
  await page.route(new RegExp(`/rest/v1/${table}(\\?|$)`), (route) => {
    if (methods.includes(route.request().method())) { hits++; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: REFUSAL, details: null, hint: null }) }); }
    return route.continue();
  });
  return () => hits;
};
let page;

// ── 1. Vendor with a payment: delete refused by the DB, reason shown; Withdraw button present ──
{
  page = await login('PURCHASE_MANAGER');
  await go(page, '/purchases?tab=vendors');
  const row = page.locator('tr', { hasText: 'TEST-P3 Vendor' });
  await row.locator('button[title="Delete vendor"]').click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  const t = await toastMatching(page, /Cannot delete|deleted/);
  const still = db(`SELECT count(*)::int n FROM vendors WHERE id='V1791003129329'`)[0].n === 1;
  const shown = await page.locator('tr', { hasText: 'TEST-P3 Vendor' }).count();
  check('V1 Delete vendor with a payment: DB refuses, reason shown, vendor kept (DB + screen)', /still has vendor payments/.test(t) && still && shown === 1, `toast="${t}" db=${still} row=${shown}`);
  // Withdraw: open the vendor's ledger; the payment row offers Withdraw. Open the dialog, then keep it.
  await page.locator('tr', { hasText: 'TEST-P3 Vendor' }).first().locator('button[title="View Ledger"]').click();
  await page.waitForTimeout(1500);
  const wd = page.locator('button[title="Withdraw this payment"]');
  const n = await wd.count();
  let dlg = '';
  if (n) { await wd.first().click(); await page.waitForTimeout(600); dlg = (await page.locator('[role="dialog"], [role="alertdialog"]').allInnerTexts().catch(() => [])).join(' '); await page.getByRole('button', { name: /Cancel|Keep/ }).last().click().catch(() => {}); }
  const pay = db(`SELECT count(*)::int n FROM vendor_payments WHERE id='VPAY-1791003520268'`)[0].n;
  check('W1 Vendor ledger shows Withdraw on the payment and it opens the confirm (kept)', n === 1 && /Withdraw this payment/.test(dlg) && pay === 1, `buttons=${n} dialog="${dlg.slice(0, 80)}" paymentInDB=${pay}`);
  // PO Close refused: reason shown, PO unchanged.
  await go(page, '/purchases');
  const hits = await refuseWrites(page, 'purchase_orders', ['PATCH']);
  await page.locator('tr', { hasText: 'TEST-PO-B5-81925' }).locator('button', { hasText: /^Close$/ }).click();
  const t2 = await toastMatching(page, new RegExp(REFUSAL));
  const st = db(`SELECT status FROM purchase_orders WHERE id='TEST-PO-B5-81925'`)[0].status;
  const chip = await page.locator('tr', { hasText: 'TEST-PO-B5-81925' }).innerText();
  check('P1 PO Close refused: reason shown, PO still GRN Done (DB + screen)', t2.includes(REFUSAL) && st === 'GRN Done' && /GRN Done/.test(chip) && hits() > 0, `toast="${t2}" db=${st}`);
  await page.context().close();
}

// ── 2. Masters: readable confirm; refused toggle shows the reason ──
{
  page = await login('ADMIN');
  await go(page, '/masters/lists');
  const removable = page.locator('button[title="Remove this option"]').first();
  await removable.click();
  await page.waitForTimeout(600);
  const dlg = (await page.locator('[role="dialog"], [role="alertdialog"]').allInnerTexts().catch(() => [])).join(' ');
  const native = page.dialogs.filter(d => d.startsWith('confirm')).join(' | ');
  await page.getByRole('button', { name: 'Cancel' }).last().click().catch(() => {});
  check('M1 Masters Remove asks in the app dialog with the option name (no [object Object])', /Remove ".+"\?/.test(dlg) && !/object Object/.test(dlg + native) && !native, `dialog="${dlg.slice(0, 80)}" native="${native}"`);
  const hits = await refuseWrites(page, 'masters', ['PATCH']);
  const toggle = page.locator('button[title="Offered in dropdowns"], button[title="Not offered in dropdowns"]').first();
  const before = await toggle.innerText();
  await toggle.click();
  let err = '';
  for (let i = 0; i < 20 && !err.includes(REFUSAL); i++) { await page.waitForTimeout(300); err = (await page.locator('p.text-rose-400').allInnerTexts()).join(' '); }
  const after = await toggle.innerText();
  check('M2 Masters On/Off refused: reason shown, toggle back as it was', err.includes(REFUSAL) && before === after && hits() > 0, `error="${err}" ${before}->${after}`);
  await page.context().close();
}

// ── 3. Scheme on/off: refusal shown; (local) real toggle saved and put back ──
{
  page = await login('ADMIN');
  await go(page, '/schemes');
  await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const card = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last();
  const tgl = card.locator('button[title="Activate"], button[title="Deactivate"]').first();
  const hits = await refuseWrites(page, 'schemes', ['PATCH']);
  await tgl.click();
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const st = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
  check('S1 Scheme on/off refused: reason shown, DB unchanged', t.includes(REFUSAL) && st === 'Inactive' && hits() > 0, `toast="${t}" db=${st}`);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (!LIVE) {
    await page.waitForTimeout(4000);
    await tgl.click();
    const t2 = await toastMatching(page, /is now Active/);
    const st2 = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
    await page.waitForTimeout(4000);
    await card.locator('button[title="Deactivate"]').first().click();
    const t3 = await toastMatching(page, /is now Inactive/);
    const st3 = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
    check('S2 Scheme on/off saved: Active in DB, then put back to Inactive', /is now Active/.test(t2) && st2 === 'Active' && /is now Inactive/.test(t3) && st3 === 'Inactive', `"${t2}" db=${st2} → "${t3}" db=${st3}`);
  }
  await page.context().close();
}

// ── 4. Inventory batch delete refused (Warehouse): reason shown, batch kept ──
{
  page = await login('WAREHOUSE');
  await go(page, '/inventory');
  await page.locator('tr', { hasText: 'TEST Neem Face Wash 100ml' }).first().click();
  await page.waitForTimeout(800);
  const hits = await refuseWrites(page, 'inventory', ['DELETE']);
  const before = db(`SELECT count(*)::int n FROM inventory WHERE product='TEST Neem Face Wash 100ml'`)[0].n;
  await page.locator('button[title="Delete"]').first().click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const after = db(`SELECT count(*)::int n FROM inventory WHERE product='TEST Neem Face Wash 100ml'`)[0].n;
  check('I1 Stock batch delete refused: reason shown, batches unchanged', t.includes(REFUSAL) && before === after && hits() > 0, `toast="${t}" batches ${before}->${after}`);
  await page.context().close();
}

// ── 5. View-only roles: no Edit ──
{
  page = await login('ACCOUNTS');
  await go(page, '/orders');
  const edits = await page.locator('button[title="Edit order"], button[title="Delete order"]').count();
  await page.locator('tbody tr').first().click();
  await page.waitForTimeout(1000);
  const title = await page.locator('h2', { hasText: /Order Details|Edit Order/ }).first().innerText().catch(() => '');
  const update = await page.locator('form button[type="submit"]', { hasText: /Update Order/ }).count();
  const disabled = await page.locator('fieldset[disabled]').count();
  check('E1 Accounts (orders view): no Edit/Delete, order opens as "Order Details", fields disabled, no Update', edits === 0 && title === 'Order Details' && update === 0 && disabled === 1, `edit/delete=${edits} title="${title}" update=${update} fieldsetDisabled=${disabled}`);
  await page.context().close();

  page = await login('SALES_EXEC_1');
  await go(page, '/orders');
  const seEdits = await page.locator('button[title="Edit order"]').count();
  await page.locator('tr', { hasText: 'O137' }).first().click();
  await page.waitForTimeout(1000);
  const seUpdate = await page.locator('form button[type="submit"]', { hasText: /Update Order/ }).count();
  const assign = await page.getByRole('button', { name: 'Assign to Warehouse Manager' }).count();
  check('E2 Sales Exec 1 (orders view): no Edit icon, but a Pending order keeps Assign to Warehouse + Update Order', seEdits === 0 && seUpdate === 1 && assign === 1, `edit=${seEdits} update=${seUpdate} assign=${assign}`);
  await page.context().close();

  for (const role of ['DIRECTOR', 'CUSTOMER_SUPPORT']) {
    page = await login(role);
    await go(page, '/leads');
    const n = await page.locator('button[title="Edit lead"], button[title="Delete lead"]').count();
    const add = await page.getByRole('button', { name: 'Add Lead' }).count();
    const rows = await page.locator('tbody tr').count();
    check(`E3 ${role} (leads view): sees leads, no Edit/Delete/Add Lead`, n === 0 && add === 0 && rows > 0, `edit/delete=${n} add=${add} rows=${rows}`);
    await page.context().close();
  }
  page = await login('SALES_EXEC_1');
  await go(page, '/leads');
  const se = await page.locator('button[title="Edit lead"]').count();
  check('E4 Sales Exec 1 (leads full): Edit lead still there (control)', se > 0, `edit=${se}`);
  await page.context().close();
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} as required${LIVE ? ' (LIVE: refusals/reads only)' : ''}`);
process.exit(results.every(Boolean) ? 0 : 1);
