// Fix batch 12: the screens as the real roles, every outcome confirmed in the database.
// Usage: BASE=http://localhost:5174 node ui.mjs   (BASE defaults to local dev). LIVE=1: read/refusal checks only (no writes).
// Writes (local only): Customer Support registers complaint "TEST B12 UI Customer" (deleted at the end by Admin via API;
// its events stay as audit history). Everything else is a refusal or a read: nothing saved.
import { login, go, browser, E } from '../phase3/lib.mjs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const LIVE = !!process.env.LIVE;
function db(sql) {
  const f = `${tmpdir()}/ui12-${Date.now()}.sql`.replace(/\\/g, '/');
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}" 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const waitFor = async (fn, tries = 10, ms = 2500) => { let v; for (let i = 0; i < tries; i++) { v = fn(); if (v) return v; await new Promise(r => setTimeout(r, ms)); } return v; };
const toasts = async (page) => (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' | ');
const toastMatching = async (page, re) => { let t = ''; for (let i = 0; i < 30 && !re.test(t); i++) { await page.waitForTimeout(500); t = await toasts(page); } return t; };
const V = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const client = async (role) => { const c = createClient(V.VITE_SUPABASE_URL, V.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const r = await c.auth.signInWithPassword({ email: E[`TEST_${role}_EMAIL`], password: E[`TEST_${role}_PASSWORD`] }); if (r.error) throw new Error(role + ' sign-in: ' + r.error.message); return c; };
let page;

// ── 1. Orders: no Delete for Dispatch; Admin keeps it ──
page = await login('DISPATCH');
await go(page, '/orders');
const dspDel = await page.locator('button[title="Delete order"]').count(), dspRows = await page.locator('tr').count();
check('O1 Dispatch sees orders but no Delete order button', dspDel === 0 && dspRows > 1, `delete=${dspDel} rows=${dspRows}`);
await page.context().close();
page = await login('ADMIN');
await go(page, '/orders');
const adDel = await page.locator('button[title="Delete order"]').count();
check('O2 Admin still has Delete order (control)', adDel > 0, `delete=${adDel}`);
await page.context().close();

// ── 2. Purchases: Warehouse gets GRN (and only GRN); Accounts none ──
page = await login('WAREHOUSE');
await go(page, '/purchases');
const row = page.locator('tr', { hasText: 'TEST-PO-1' });
const whGrn = await row.locator('button', { hasText: /^GRN$/ }).count();
const whOther = await row.locator('button[title="Delete this purchase order"], button[title="Cancel this purchase order"]').count();
let modal = false;
if (whGrn) {
  await row.locator('button', { hasText: /^GRN$/ }).click();
  modal = await page.getByText('Record GRN — TEST-PO-1').isVisible().catch(() => false);
  await page.locator('button[title="Close"]').first().click().catch(() => {});
}
check('G1 Warehouse: GRN button on TEST-PO-1 opens the GRN form; no Cancel/Delete', whGrn === 1 && whOther === 0 && modal, `grn=${whGrn} cancel/delete=${whOther} form=${modal}`);
const chips = await page.locator('button').allInnerTexts();
check('M1 Warehouse sees the DB master list (PO status chip "Partially Received", not in the built-in default)', chips.some(o => o.trim() === 'Partially Received'), `chips include: ${chips.filter(o => /Partially|GRN Done/.test(o)).map(s => s.trim()).join(', ')}`);
await page.context().close();
page = await login('ACCOUNTS');
await go(page, '/purchases');
const accGrn = await page.locator('tr', { hasText: 'TEST-PO-1' }).locator('button', { hasText: /^GRN$/ }).count();
check('G2 Accounts (view only): no GRN button', accGrn === 0, `grn=${accGrn}`);
await page.context().close();

// ── 3. Master lists through the API: staff read, partners don't ──
for (const role of ['SALES_EXEC_1', 'DISPATCH', 'CUSTOMER_SUPPORT', 'DISTRIBUTOR']) {
  const c = await client(role);
  const { data, error } = await c.from('masters').select('id');
  const n = data?.length ?? -1;
  check(`M2 ${role} reads master lists via API`, role === 'DISTRIBUTOR' ? n === 0 : n > 50, `rows=${n}${error ? ' ' + error.message : ''}`);
}
{ // stale-screen duplicate: the DB answers with the sentence the Masters screen shows
  const c = await client('ADMIN');
  const { error } = await c.from('masters').insert([{ id: 'M-TEST-B12-UI', list: 'lead_source', key: 'WEBSITE', label: 'WEBSITE' }]);
  check('D1 Admin inserts lead source WEBSITE via API -> 23505 masters_list_key_ci', error?.code === '23505' && /masters_list_key_ci/.test(error.message) && db(`SELECT count(*)::int n FROM masters WHERE id='M-TEST-B12-UI'`)[0].n === 0, error?.message || 'saved!');
}

// ── 4. Admin: product in use cannot be deleted; refusal shown, product still there ──
page = await login('ADMIN');
await go(page, '/masters/products');
const prow = page.locator('tr').filter({ has: page.locator('div.font-semibold', { hasText: /^TEST Neem Face Wash 100ml$/ }) });
if (!LIVE) {
  await prow.locator('button[title="Delete product"]').click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  const t = await toastMatching(page, /in use|deleted/i);
  const still = db(`SELECT count(*)::int n FROM products WHERE id='TEST-P-1'`)[0].n === 1;
  const shown = await prow.count();
  check('P1 Admin deletes TEST Neem Face Wash: "in use" refusal shown, still in DB and on screen', /is in use/.test(t) && still && shown === 1, `toast="${t.slice(0, 160)}" db=${still} row=${shown}`);
}
// rename in use: edit form stays open with the refusal; price above MRP refused before saving
await prow.locator('button[title="Edit product"]').click();
const nameInput = page.locator('form input[type="text"]').first();
const oldName = await nameInput.inputValue();
await nameInput.fill(oldName + ' RENAMED');
await page.locator('form button[type="submit"]').click();
const t2 = await toastMatching(page, /in use|Could not/i);
const keptName = db(`SELECT name FROM products WHERE id='TEST-P-1'`)[0].name;
check('P2 Admin renames TEST Neem Face Wash: refusal shown, name unchanged in DB', /cannot be renamed/.test(t2) && keptName === 'TEST Neem Face Wash 100ml', `toast="${t2.slice(0, 160)}" db="${keptName}"`);
await page.context().close();

// ── 5. Admin: a 150% scheme is refused on the form, nothing saved ──
page = await login('ADMIN');
await go(page, '/schemes');
await page.getByRole('button', { name: 'Create Scheme' }).first().click();
await page.fill('#schemes-scheme-name', 'TEST B12 UI Scheme');
await page.fill('#schemes-discount-if-applicable', '150');
await page.locator('#schemes-discount-if-applicable').evaluate(el => el.removeAttribute('max'));   // past the browser's own max=100
await page.locator('form button[type="submit"]').click();
const t3 = await toastMatching(page, /between 0 and 100/);
await page.waitForTimeout(2000);
const sch = db(`SELECT count(*)::int n FROM schemes WHERE name='TEST B12 UI Scheme'`)[0].n;
check('S1 Admin creates a 150% scheme: refusal shown, nothing in DB', /between 0 and 100/.test(t3) && sch === 0, `toast="${t3}" rows=${sch}`);
await page.context().close();

// ── 6. Admin: bad phone on a distributor refused on the form, DB unchanged ──
page = await login('ADMIN');
await go(page, '/distributors');
const beforePh = db(`SELECT phone FROM distributors WHERE id='D-TEST-1'`)[0].phone;
await page.locator('tr', { hasText: 'TEST Distributor Pvt Ltd' }).locator('button[title="Edit distributor"]').first().click();
await page.fill('#distributors-phone', '12345');
await page.locator('form button[type="submit"]', { hasText: 'Save Changes' }).click();
const t4 = await toastMatching(page, /Phone/);
await page.waitForTimeout(2000);
const afterPh = db(`SELECT phone FROM distributors WHERE id='D-TEST-1'`)[0].phone;
check('C1 Admin sets phone 12345 on TEST Distributor: refusal shown, DB unchanged', /Phone must be/.test(t4) && afterPh === beforePh, `toast="${t4.slice(0, 100)}" db=${afterPh}`);
await page.context().close();

// ── 7. Customer Support registers a complaint: number from the DB, above every number ever used ──
if (!LIVE) {
  const highest = db(`SELECT greatest((SELECT max(substr(row_id,5)::int) FROM audit_log WHERE table_name='complaints' AND row_id ~ '^CMP-[0-9]+$'),(SELECT max(substr("dataId",5)::int) FROM events WHERE "dataId" ~ '^CMP-[0-9]+$')) h`)[0].h;
  page = await login('CUSTOMER_SUPPORT');
  await go(page, '/complaints');
  await page.getByRole('button', { name: 'Register Complaint' }).first().click();
  await page.fill('#complaints-customer-name', 'TEST B12 UI Customer');
  const ty = await page.locator('#complaints-complaint-type option').nth(1).getAttribute('value');
  if (ty) await page.selectOption('#complaints-complaint-type', ty);
  await page.locator('form button[type="submit"]', { hasText: 'Register Complaint' }).click();
  const t5 = await toastMatching(page, /registered|could not/i);
  const cmp = await waitFor(() => db(`SELECT id FROM complaints WHERE "customerName"='TEST B12 UI Customer'`)[0]);
  const num = Number(cmp?.id?.slice(4));
  check('N1 Customer Support registers a complaint: DB number above every number ever used, shown in toast', num > highest && t5.includes(cmp.id), `${cmp?.id} (highest before ${highest}) toast="${t5}"`);
  await page.context().close();
  if (cmp) {
    const ad = await client('ADMIN');
    const d = await ad.from('complaints').delete().eq('id', cmp.id).select('id');
    check(`X cleanup: ${cmp.id} deleted`, d.data?.length === 1 && db(`SELECT count(*)::int n FROM complaints WHERE id='${cmp.id}'`)[0].n === 0, d.error?.message || 'ok');
  }
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} as required${LIVE ? ' (LIVE: reads/refusals only)' : ''}`);
process.exit(results.every(Boolean) ? 0 : 1);
