// Fix batch 13 (front-end only): forms wait for the database. Each form is checked as a real role for:
//   REFUSAL — the save request is answered with a database refusal (Playwright intercepts it, so nothing
//             reaches the server): the reason is shown, the form stays open, the DB is unchanged;
//   SUCCESS — (local only) a real save on a TEST row: "Saving…" while waiting, success shown, form closed,
//             the change is in the DB; then put back via the API and checked.
// Usage: BASE=http://localhost:5174 node ui.mjs  (run from Git Bash). LIVE=1: refusal checks only (no writes).
import { login, go, browser, E } from '../phase3/lib.mjs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const LIVE = !!process.env.LIVE;
function db(sql) {
  const f = `${tmpdir()}/ui13-${Date.now()}.sql`.replace(/\\/g, '/');
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}" 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const toasts = async (page) => (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' | ');
const toastMatching = async (page, re, tries = 40) => { let t = ''; for (let i = 0; i < tries && !re.test(t); i++) { await page.waitForTimeout(500); t = await toasts(page); } return t; };
const V = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const client = async (role) => { const c = createClient(V.VITE_SUPABASE_URL, V.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const r = await c.auth.signInWithPassword({ email: E[`TEST_${role}_EMAIL`], password: E[`TEST_${role}_PASSWORD`] }); if (r.error) throw new Error(role + ' sign-in: ' + r.error.message); return c; };
const REFUSAL = 'TEST B13 simulated refusal';
// Answer the next write to `table` (POST/PATCH) with a database refusal, as PostgREST would.
const refuseWrites = async (page, table) => {
  let hits = 0;
  await page.route(new RegExp(`/rest/v1/${table}(\\?|$)`), (route) => {
    const m = route.request().method();
    if (m === 'POST' || m === 'PATCH') { hits++; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: REFUSAL, details: null, hint: null }) }); }
    return route.continue();
  });
  return () => hits;
};
// Click submit; report whether the button said "Saving…" while waiting.
const submitAndWatch = async (page, button) => {
  await button.click();
  let sawSaving = false;
  for (let i = 0; i < 20 && !sawSaving; i++) { sawSaving = /Saving…/.test(await button.innerText().catch(() => '')); if (!sawSaving) await page.waitForTimeout(50); }
  return sawSaving;
};
const formOpen = (page, sel) => page.locator(sel).isVisible().catch(() => false);
let page;

// ── 1. Distributor edit (Admin) ──
{
  const before = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
  page = await login('ADMIN');
  await go(page, '/distributors');
  const hits = await refuseWrites(page, 'distributors');
  await page.locator('tr', { hasText: 'TEST Distributor Pvt Ltd' }).locator('button[title="Edit distributor"]').first().click();
  await page.fill('#distributors-contact-person', 'TEST B13 Contact');
  const saving = await submitAndWatch(page, page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ }));
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const open = await formOpen(page, '#distributors-contact-person');
  const after = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
  check('R1 Distributor edit refused: reason shown, form open, DB unchanged', t.includes(REFUSAL) && open && after === before && hits() > 0 && saving, `toast="${t}" open=${open} saving=${saving} db="${after}"`);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (!LIVE) {
    const saving2 = await submitAndWatch(page, page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ }));
    const t2 = await toastMatching(page, /Distributor saved/);
    await page.waitForTimeout(500);
    const open2 = await formOpen(page, '#distributors-contact-person');
    const saved = db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c;
    check('S1 Distributor edit saved: Saving…, success shown, form closed, DB has it', /Distributor saved/.test(t2) && !open2 && saved === 'TEST B13 Contact' && saving2, `toast="${t2}" open=${open2} saving=${saving2} db="${saved}"`);
    const ad = await client('ADMIN');
    await ad.from('distributors').update({ contactPerson: before }).eq('id', 'D-TEST-1');
    check('X1 put back D-TEST-1 contact person', db(`SELECT "contactPerson" c FROM distributors WHERE id='D-TEST-1'`)[0].c === before, before);
  }
  await page.context().close();
}

// ── 2. Scheme create (Admin) ──
{
  page = await login('ADMIN');
  await go(page, '/schemes');
  const hits = await refuseWrites(page, 'schemes');
  await page.getByRole('button', { name: 'Create Scheme' }).first().click();
  await page.fill('#schemes-scheme-name', 'TEST B13 Scheme');
  await page.fill('#schemes-discount-if-applicable', '5');
  await page.selectOption('#schemes-status', 'Inactive').catch(() => {});
  const btn = page.locator('form button[type="submit"]', { hasText: /Create Scheme|Saving/ });
  const saving = await submitAndWatch(page, btn);
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const open = await formOpen(page, '#schemes-scheme-name');
  const n = db(`SELECT count(*)::int n FROM schemes WHERE name='TEST B13 Scheme'`)[0].n;
  const listed = await page.locator('text=TEST B13 Scheme').count();
  check('R2 Scheme create refused: reason shown, form open, not in DB or list', t.includes(REFUSAL) && open && n === 0 && hits() > 0 && saving, `toast="${t}" open=${open} saving=${saving} db=${n} listedOutsideForm=${listed}`);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (!LIVE) {
    await submitAndWatch(page, btn);
    const t2 = await toastMatching(page, /Scheme TEST B13 Scheme added/);
    const row = db(`SELECT id FROM schemes WHERE name='TEST B13 Scheme'`)[0];
    check('S2 Scheme create saved: success shown, form closed, row in DB', /added/.test(t2) && !(await formOpen(page, '#schemes-scheme-name')) && !!row, `toast="${t2}" db=${row?.id}`);
    if (row) {
      const ad = await client('ADMIN');
      const d = await ad.from('schemes').delete().eq('id', row.id).select('id');
      check(`X2 cleanup: scheme ${row.id} deleted`, d.data?.length === 1, d.error?.message || 'ok');
    }
  }
  await page.context().close();
}

// ── 3. Vendor edit (Purchase Manager) ──
{
  const before = db(`SELECT "contactPerson" c FROM vendors WHERE id='TEST-V-1'`)[0].c;
  page = await login('PURCHASE_MANAGER');
  await go(page, '/purchases?tab=vendors');
  const hits = await refuseWrites(page, 'vendors');
  await page.locator('tr', { hasText: 'TEST Herbal Raw Materials Co' }).locator('button[title="Edit vendor"]').first().click();
  await page.fill('#purchases-contact-person', 'TEST B13 Vendor Contact');
  const btn = page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ });
  const saving = await submitAndWatch(page, btn);
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const open = await formOpen(page, '#purchases-contact-person');
  const after = db(`SELECT "contactPerson" c FROM vendors WHERE id='TEST-V-1'`)[0].c;
  check('R3 Vendor edit refused: reason shown, form open, DB unchanged', t.includes(REFUSAL) && open && after === before && hits() > 0 && saving, `toast="${t}" open=${open} saving=${saving} db="${after}"`);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (!LIVE) {
    await submitAndWatch(page, btn);
    const t2 = await toastMatching(page, /Vendor saved/);
    const saved = db(`SELECT "contactPerson" c, "outstandingAmount" o FROM vendors WHERE id='TEST-V-1'`)[0];
    check('S3 Vendor edit saved: success shown, form closed, DB has it, balance untouched', /Vendor saved/.test(t2) && !(await formOpen(page, '#purchases-contact-person')) && saved.c === 'TEST B13 Vendor Contact' && Number(saved.o) === 4839, `toast="${t2}" db="${saved.c}" owed=${saved.o}`);
    const pm = await client('PURCHASE_MANAGER');
    await pm.from('vendors').update({ contactPerson: before }).eq('id', 'TEST-V-1');
    check('X3 put back TEST-V-1 contact person', db(`SELECT "contactPerson" c FROM vendors WHERE id='TEST-V-1'`)[0].c === before, String(before));
  }
  await page.context().close();
}

// ── 4. Stock adjust (Warehouse): refusal only ──
{
  page = await login('WAREHOUSE');
  await go(page, '/inventory');
  const hits = await refuseWrites(page, 'inventory');
  // Batches are listed in the product's detail panel.
  await page.locator('tr', { hasText: 'TEST Neem Face Wash 100ml' }).first().click();
  await page.waitForTimeout(800);
  const adj = page.locator('button[title="Adjust Stock"]').first();
  const ok = await adj.count();
  if (ok) {
    await adj.click();
    const before = await page.locator('h3').allInnerTexts();
    await page.fill('#inventory-adjustment-to-add-to-subtract', '1');
    const reason = page.locator('#inventory-reason');
    if ((await reason.evaluate(el => el.tagName)) === 'SELECT') { const v = await reason.locator('option').nth(1).getAttribute('value'); await reason.selectOption(v); } else await reason.fill('TEST B13 adjust');
    const btn = page.locator('form button[type="submit"]', { hasText: /Apply Adjustment|Saving/ });
    const saving = await submitAndWatch(page, btn);
    const t = await toastMatching(page, new RegExp(REFUSAL));
    const open = await formOpen(page, '#inventory-adjustment-to-add-to-subtract');
    check('R4 Stock adjust refused: reason shown, dialog open', t.includes(REFUSAL) && open && hits() > 0 && saving, `toast="${t}" open=${open} saving=${saving} (${before.join('/').slice(0, 60)})`);
  } else check('R4 Stock adjust refused', false, 'no Adjust Stock button');
  await page.context().close();
}

// ── 5. SFA expense (Sales Exec 1): refusal only ──
{
  page = await login('SALES_EXEC_1');
  await go(page, '/sfa');
  const hits = await refuseWrites(page, 'sfa_expenses');
  await page.getByRole('button', { name: 'File Expense' }).first().click();
  await page.fill('#sfa-amount', '123');
  await page.fill('#sfa-description', 'TEST B13 expense');
  const btn = page.locator('form button[type="submit"]', { hasText: /Submit Claim|Saving/ });
  const saving = await submitAndWatch(page, btn);
  const t = await toastMatching(page, new RegExp(REFUSAL));
  const open = await formOpen(page, '#sfa-amount');
  const n = db(`SELECT count(*)::int n FROM sfa_expenses WHERE description='TEST B13 expense'`)[0].n;
  check('R5 SFA expense refused: reason shown, form open, nothing in DB', t.includes(REFUSAL) && open && n === 0 && hits() > 0 && saving, `toast="${t}" open=${open} saving=${saving} db=${n}`);
  await page.context().close();
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} as required${LIVE ? ' (LIVE: refusals only)' : ''}`);
process.exit(results.every(Boolean) ? 0 : 1);
