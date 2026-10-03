// Fix batch 11: the screens as the real roles, every outcome confirmed in the database.
// Usage: BASE=http://localhost:5174 node ui.mjs   (BASE defaults to local dev). LIVE=1: refusal checks only (no writes).
// TEST rows: complaint CMP-TEST-B11-UI (made by Admin via API, deleted on screen), Sales Exec 1's
// "TEST B11 UI Customer" complaint (deleted at the end by Admin via API); their events stay (audit).
import { login, go, browser, E } from '../phase3/lib.mjs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const LIVE = !!process.env.LIVE;
function db(sql) {
  const f = `${tmpdir()}/ui11-${Date.now()}.sql`.replace(/\\/g, '/');
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
const V = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const ad = createClient(V.VITE_SUPABASE_URL, V.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await ad.auth.signInWithPassword({ email: E.TEST_ADMIN_EMAIL, password: E.TEST_ADMIN_PASSWORD });
const start = new Date(Date.now() - 60000).toISOString();
let page;

// ── 1. Admin, Roles screen: Settings = full on Sales is refused, nothing saved ──
page = await login('ADMIN');
await go(page, '/masters/roles');
// A role card reads "<level>\nActive\n<role name>\n…": pick the one named exactly "Sales".
const cardIx = await page.locator('button').evaluateAll(bs => bs.findIndex(b => { const l = b.innerText.split('\n').map(s => s.trim()).filter(Boolean); return l[1] === 'Active' && l[2] === 'Sales'; }));
if (cardIx < 0) throw new Error('Sales role card not found');
await page.locator('button').nth(cardIx).click();
await page.locator('[role="radiogroup"][aria-label="Access to Settings & Master Lists"] [role="radio"]', { hasText: 'full' }).click();
await page.waitForTimeout(1500);
const roleErr = await page.locator('p.text-rose-400').allInnerTexts();
check('R1 Admin clicks Settings=full on Sales: refusal shown, DB still none', roleErr.join(' ').includes('Only a Super Admin') && db(`SELECT permissions->>'settings' s FROM roles WHERE id='Sales'`)[0].s === 'none', roleErr.join(' | '));
await page.context().close();

// ── 2. Customer Support: no Delete on complaints ──
if (!LIVE) {
  const r = await ad.from('complaints').insert([{ id: 'CMP-TEST-B11-UI', complaintType: 'Product Quality', customerName: 'TEST B11 UI Delete Me', distributorId: 'D-TEST-1', status: 'Registered' }]);
  if (r.error) throw new Error('setup complaint: ' + r.error.message);
}
page = await login('CUSTOMER_SUPPORT');
await go(page, '/complaints');
const csDel = await page.locator('button[title="Delete complaint"]').count();
const csRows = await page.locator('tr').count();
check('C1 Customer Support sees complaints but no Delete button', csDel === 0 && csRows > 1, `delete buttons=${csDel}, rows=${csRows}`);
await page.context().close();

// ── 3. Sales Exec 1 registers a complaint on screen: complaint + event with own e-mail ──
if (!LIVE) {
  page = await login('SALES_EXEC_1');
  await go(page, '/complaints');
  await page.getByRole('button', { name: 'Register Complaint' }).first().click();
  await page.fill('#complaints-customer-name', 'TEST B11 UI Customer');
  const t = await page.locator('#complaints-complaint-type option').nth(1).getAttribute('value');
  if (t) await page.selectOption('#complaints-complaint-type', t);
  await page.locator('form button[type="submit"]', { hasText: 'Register Complaint' }).click();
  const cmp = await waitFor(() => db(`SELECT id FROM complaints WHERE "customerName"='TEST B11 UI Customer'`)[0]);
  const ev = await waitFor(() => db(`SELECT "actorEmail", type FROM events WHERE "dataId"='${cmp?.id}' AND type='complaint_registered' AND "timestamp" > '${start}'`)[0]);
  check('E1 Sales Exec 1 registers a complaint: complaint_registered event saved with own e-mail (was 403)', !!cmp && ev?.actorEmail === E.TEST_SALES_EXEC_1_EMAIL.toLowerCase(), `${cmp?.id} ${JSON.stringify(ev)}`);
  await page.context().close();

  // ── 4. Admin deletes CMP-TEST-B11-UI on screen: toast, gone in DB, event logged ──
  page = await login('ADMIN');
  await go(page, '/complaints');
  await page.locator('tr', { hasText: 'CMP-TEST-B11-UI' }).locator('button[title="Delete complaint"]').click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  let t4 = '';
  for (let i = 0; i < 20 && !/deleted|Not deleted/i.test(t4); i++) { await page.waitForTimeout(500); t4 = await toasts(page); }
  const gone = await waitFor(() => db(`SELECT count(*)::int n FROM complaints WHERE id='CMP-TEST-B11-UI'`)[0].n === 0);
  const ev4 = db(`SELECT "actorEmail" FROM events WHERE "dataId"='CMP-TEST-B11-UI' AND type='complaint_deleted'`)[0];
  check('C2 Admin deletes CMP-TEST-B11-UI: row gone in DB, success shown, event by Admin', gone && /deleted/i.test(t4) && ev4?.actorEmail === E.TEST_ADMIN_EMAIL.toLowerCase(), `toast="${t4}" event=${JSON.stringify(ev4)}`);
  await page.context().close();

  // Sales Exec 1's test complaint: removed by Admin through the API, checked in the DB.
  if (cmp) {
    const d = await ad.from('complaints').delete().eq('id', cmp.id).select('id');
    check(`X cleanup: ${cmp.id} deleted`, d.data?.length === 1 && db(`SELECT count(*)::int n FROM complaints WHERE id='${cmp.id}'`)[0].n === 0, d.error?.message || 'ok');
  }
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} as required${LIVE ? ' (LIVE: refusals only)' : ''}`);
process.exit(results.every(Boolean) ? 0 : 1);
