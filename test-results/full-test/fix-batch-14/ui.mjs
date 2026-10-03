// Fix batch 14: no save can hang. A write held with no answer is given up after 20 s with a clear
// message; the form shows "Saving…" meanwhile and stays open after; the DB is unchanged (the held
// request never reaches the server). Batch 13 forms as real roles + a single-click save.
// Local only (LIVE unset): real saves confirmed in the DB and put back; a 5 s write is noted in
// the save journal as a slow request.
// Rule (batch 14): no DB check while interception is on (db() refuses; unrouteAll first).
// Usage (Git Bash): BASE=http://localhost:5174 node ui.mjs ; LIVE=1 BASE=<live> node ui.mjs
import { assertNotIntercepting, login, go } from '../phase3/lib.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const LIVE = !!process.env.LIVE;
function db(sql) {
  assertNotIntercepting();
  const f = `${tmpdir()}/ui14-${Date.now()}.sql`.replace(/\\/g, '/');
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}" 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const TIMEOUT_TEXT = 'No answer from the server after 20 seconds. It may or may not have saved — refresh the page and check before trying again.';
// Every toast ever shown (they fade).
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
const toastMatching = async (page, re, tries = 80) => { let t = ''; for (let i = 0; i < tries && !re.test(t); i++) { await page.waitForTimeout(500); t = await toasts(page); } return t; };
// Hold writes to `table`: never answered (the browser gives up), or answered after `ms`.
const holdWrites = async (page, table, methods = ['POST', 'PATCH', 'DELETE'], ms = null) => {
  let hits = 0;
  await page.route(new RegExp(`/rest/v1/${table}(\\?|$)`), async (route) => {
    if (!methods.includes(route.request().method())) return route.continue();
    hits++;
    if (ms === null) return; // never answered
    await new Promise(r => setTimeout(r, ms));
    return route.continue().catch(() => {});
  });
  return () => hits;
};
// Click; report whether the button showed "Saving…", how long until the timeout message, and
// whether the button came back (not stuck on Saving…).
const submitAndTime = async (page, button) => {
  await toasts(page);
  const t0 = Date.now();
  await button.click();
  let saving = false;
  for (let i = 0; i < 20 && !saving; i++) { saving = /Saving…/.test(await button.innerText().catch(() => '')); if (!saving) await page.waitForTimeout(50); }
  const t = await toastMatching(page, /No answer from the server/);
  const secs = (Date.now() - t0) / 1000;
  await page.waitForTimeout(300);
  const after = await button.innerText().catch(() => '');
  return { saving, t, secs, released: !/Saving…/.test(after) };
};
const okTimeout = (r) => r.saving && r.t.includes(TIMEOUT_TEXT) && r.secs >= 19.5 && r.secs < 26 && r.released;
const fmt = (r) => `saving=${r.saving} after=${r.secs.toFixed(1)}s released=${r.released} toast="${r.t.slice(0, 90)}"`;
const formOpen = (page, sel) => page.locator(sel).isVisible().catch(() => false);
let page;

// ── 1. Distributor edit (Admin) held: timeout; then (local) a real save ──
{
  const before = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
  page = await login('ADMIN');
  await go(page, '/distributors');
  const hits = await holdWrites(page, 'distributors');
  await page.locator('tr', { hasText: 'TEST Distributor Pvt Ltd' }).locator('button[title="Edit distributor"]').first().click();
  await page.fill('#distributors-contact-person', 'TEST B14 Contact');
  const btn = page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ });
  const r = await submitAndTime(page, btn);
  const open = await formOpen(page, '#distributors-contact-person');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const after = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
  check('T1 Distributor edit, no answer: Saving…, message at 20 s, form open, DB unchanged', okTimeout(r) && open && after === before && hits() > 0, `${fmt(r)} open=${open} db="${after}"`);
  if (!LIVE) {
    const t0 = Date.now();
    await btn.click();
    const t2 = await toastMatching(page, /Distributor saved/);
    const secs = (Date.now() - t0) / 1000;
    const saved = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
    check('S1 Distributor edit then saved for real: success, DB has it, quick', /Distributor saved/.test(t2) && saved === 'TEST B14 Contact' && secs < 5, `toast="${t2}" db="${saved}" ${secs.toFixed(1)}s`);
    await page.locator('tr', { hasText: 'TEST Distributor Pvt Ltd' }).locator('button[title="Edit distributor"]').first().click();
    await page.fill('#distributors-contact-person', before);
    await btn.click();
    await toastMatching(page, /Distributor saved/);
    const back = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
    check('X1 D-TEST-1 contact person put back (through the app)', back === before, String(back));
  }
  await page.context().close();
}

// ── 2. Scheme create (Admin) held: timeout, nothing in DB or list ──
{
  page = await login('ADMIN');
  await go(page, '/schemes');
  const hits = await holdWrites(page, 'schemes');
  await page.getByRole('button', { name: 'Create Scheme' }).first().click();
  await page.fill('#schemes-scheme-name', 'TEST B14 Scheme');
  await page.fill('#schemes-discount-if-applicable', '5');
  await page.selectOption('#schemes-status', 'Inactive').catch(() => {});
  const r = await submitAndTime(page, page.locator('form button[type="submit"]', { hasText: /Create Scheme|Saving/ }));
  const open = await formOpen(page, '#schemes-scheme-name');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const n = db(`SELECT count(*)::int n FROM schemes WHERE name='TEST B14 Scheme'`)[0].n;
  check('T2 Scheme create, no answer: Saving…, message at 20 s, form open, nothing in DB', okTimeout(r) && open && n === 0 && hits() > 0, `${fmt(r)} open=${open} db=${n}`);
  await page.context().close();
}

// ── 3. Vendor edit (Purchase Manager) held ──
{
  const before = db(`SELECT "contactPerson" c FROM vendors WHERE id='TEST-V-1'`)[0].c;
  page = await login('PURCHASE_MANAGER');
  await go(page, '/purchases?tab=vendors');
  const hits = await holdWrites(page, 'vendors');
  await page.locator('tr', { hasText: 'TEST Herbal Raw Materials Co' }).locator('button[title="Edit vendor"]').first().click();
  await page.fill('#purchases-contact-person', 'TEST B14 Vendor Contact');
  const r = await submitAndTime(page, page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ }));
  const open = await formOpen(page, '#purchases-contact-person');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const after = db(`SELECT "contactPerson" c FROM vendors WHERE id='TEST-V-1'`)[0].c;
  check('T3 Vendor edit, no answer: Saving…, message at 20 s, form open, DB unchanged', okTimeout(r) && open && after === before && hits() > 0, `${fmt(r)} open=${open} db="${after}"`);
  await page.context().close();
}

// ── 4. SFA expense (Sales Exec 1) held ──
{
  page = await login('SALES_EXEC_1');
  await go(page, '/sfa');
  const hits = await holdWrites(page, 'sfa_expenses');
  await page.getByRole('button', { name: 'File Expense' }).first().click();
  await page.fill('#sfa-amount', '123');
  await page.fill('#sfa-description', 'TEST B14 expense');
  const r = await submitAndTime(page, page.locator('form button[type="submit"]', { hasText: /Submit Claim|Saving/ }));
  const open = await formOpen(page, '#sfa-amount');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const n = db(`SELECT count(*)::int n FROM sfa_expenses WHERE description='TEST B14 expense'`)[0].n;
  check('T4 SFA expense, no answer: Saving…, message at 20 s, form open, nothing in DB', okTimeout(r) && open && n === 0 && hits() > 0, `${fmt(r)} open=${open} db=${n}`);
  await page.context().close();
}

// ── 5. Single click: scheme on/off (Admin) held; (local) a 5 s save is noted as a slow request ──
{
  page = await login('ADMIN');
  await go(page, '/schemes');
  await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const card = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last();
  const tgl = card.locator('button[title="Activate"], button[title="Deactivate"]').first();
  const hits = await holdWrites(page, 'schemes', ['PATCH']);
  await toasts(page);
  const t0 = Date.now();
  await tgl.click();
  const t = await toastMatching(page, /No answer from the server/);
  const secs = (Date.now() - t0) / 1000;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const st = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
  check('T5 Scheme on/off, no answer: message at 20 s, still Inactive in DB', t.includes(TIMEOUT_TEXT) && secs >= 19.5 && secs < 26 && st === 'Inactive' && hits() > 0, `${secs.toFixed(1)}s toast="${t.slice(0, 90)}" db=${st}`);
  if (!LIVE) {
    await page.waitForTimeout(4000);
    await holdWrites(page, 'schemes', ['PATCH'], 5000);
    await tgl.click();
    const t2 = await toastMatching(page, /is now Active/);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const log = await page.evaluate(() => JSON.stringify(window.__prismoraWriteLog || []));
    const st2 = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
    const noted = /"event":"slow request","detail":"PATCH \/rest\/v1\/schemes[^"]*\d{4}ms 200"/.test(log);
    check('J1 A 5 s save: saved (Active in DB) and the journal notes the slow request', /is now Active/.test(t2) && st2 === 'Active' && noted, `toast="${t2}" db=${st2} noted=${noted}`);
    await page.waitForTimeout(4000);
    await card.locator('button[title="Deactivate"]').first().click();
    const t3 = await toastMatching(page, /is now Inactive/);
    const st3 = db(`SELECT status FROM schemes WHERE id='SCH-1790405906612'`)[0].status;
    check('X5 TEST scheme put back to Inactive', /is now Inactive/.test(t3) && st3 === 'Inactive', `db=${st3}`);
  }
  await page.context().close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
