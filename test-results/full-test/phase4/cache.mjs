// RISK-CACHE (browser, read-only): one browser profile shared by several people.
// Sign in as Admin, sign out, sign in as another role in the same tab: does anything from the previous
// person survive (localStorage cache, screen)? Cache row counts are compared with what the new user's own
// API session may read. Plus: a second tab still open as the previous user. No writes.
// Run: cd phase4 && CHROME_ARGS=--disable-quic node cache.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { login, settle, BASE, E } from '../phase3/lib.mjs';

const env = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const TABLES = { attendance: 'attendance', sfa_expenses: 'sfa_expenses', beat_plans: 'beat_plans', complaints: 'complaints', credit_notes: 'credit_notes',
  dealers: 'dealers', distributor_incentives: 'distributor_incentives', distributor_payments: 'distributor_payments', distributors: 'distributors',
  expenses: 'expenses', grn: 'grn', inventory: 'inventory', invoices: 'invoices', leads: 'leads', orders: 'orders', product_catalog: 'products',
  purchase_orders: 'purchase_orders', purchase_returns: 'purchase_returns', retailers: 'retailers', scheme_claims: 'scheme_claims', schemes: 'schemes',
  territories: 'territories', vendor_payments: 'vendor_payments', vendors: 'vendors', masters: 'masters', visit_reports: 'visit_reports',
  beat_checkin_requests: 'beat_checkin_requests' };
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; log(`  ${ok ? 'PASS' : 'FAIL'} ${what}`); };

const cacheCounts = (page) => page.evaluate((keys) => {
  const out = {};
  for (const k of keys) { const v = localStorage.getItem('prismora_' + k); out[k] = v == null ? null : (() => { try { return JSON.parse(v).length; } catch { return 'bad'; } })(); }
  out._user = (() => { try { return JSON.parse(localStorage.getItem('prismora_user') || 'null')?.email || null; } catch { return 'bad'; } })();
  out._keys = Object.keys(localStorage).filter(k => k.startsWith('prismora_')).sort();
  return out;
}, Object.keys(TABLES));

async function apiCounts(who) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: E[`TEST_${who}_EMAIL`], password: E[`TEST_${who}_PASSWORD`] });
  if (error) throw new Error('api sign-in ' + who + ': ' + error.message);
  const out = {};
  for (const [k, t] of Object.entries(TABLES)) { const r = await sb.from(t).select('*', { count: 'exact', head: true }); out[k] = r.error ? 'err' : r.count; }
  await sb.auth.signOut();
  return out;
}

async function signOut(page) {
  await page.locator('div.relative.ml-2 > button').first().click();
  await page.getByText('Sign Out', { exact: true }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function signInSamePage(page, who) {
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  await page.fill('input[type="email"], input[name="email"], input[type="text"]', E[`TEST_${who}_EMAIL`]);
  await page.fill('input[type="password"]', E[`TEST_${who}_PASSWORD`]);
  // Watch the first seconds after sign-in: whose rows does the screen and the cache hold?
  const early = [];
  await page.click('button[type="submit"]');
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(400); early.push(await cacheCounts(page)); }
  await settle(page);
  return early;
}

function compare(label, cache, api, prevAdmin) {
  const over = [], under = [];
  for (const k of Object.keys(TABLES)) {
    if (cache[k] == null || api[k] === 'err') continue;
    if (cache[k] > api[k]) over.push(`${k} ${cache[k]}>${api[k]}`);
    else if (cache[k] < api[k]) under.push(`${k} ${cache[k]}<${api[k]}`);
  }
  check(over.length === 0, `${label}: no cached table holds more rows than this user may read${over.length ? ' — ' + over.join(', ') : ''}`);
  if (under.length) log(`  note ${label}: cache below API count (paging/filters/not loaded): ${under.join(', ')}`);
}

const admin = await login('ADMIN');
const ctx = admin.context();
await admin.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await settle(admin);
const a = await cacheCounts(admin);
log('C1 Admin signed in. cache rows:', JSON.stringify(Object.fromEntries(Object.keys(TABLES).map(k => [k, a[k]]))));
check(a._user === E.TEST_ADMIN_EMAIL.toLowerCase() || a._user === E.TEST_ADMIN_EMAIL, 'C1 prismora_user is Admin');
check((a.invoices || 0) > 0 && (a.vendors || 0) > 0, 'C1 Admin cache filled (invoices, vendors)');

await signOut(admin);
const s = await cacheCounts(admin);
const left = s._keys.filter(k => !['prismora_theme', 'prismora_data_version', 'prismora_monthly_target', 'prismora_ytd_target'].includes(k) && !k.startsWith('prismora_notifications_'));
log('C2 after Sign Out, prismora_* keys:', s._keys.join(', ') || '(none)');
check(left.length === 0, `C2 no cached table or user left after Sign Out${left.length ? ' — left: ' + left.join(', ') : ''}`);
const loginText = await admin.locator('body').innerText();
check(!/TEST Admin/.test(loginText), 'C2 login page shows nothing of Admin');

for (const who of ['SALES_EXEC_1', 'DISTRIBUTOR']) {
  const early = await signInSamePage(admin, who);
  const api = await apiCounts(who);
  const after = await cacheCounts(admin);
  log(`C3 ${who} signed in (same tab). cache rows:`, JSON.stringify(Object.fromEntries(Object.keys(TABLES).map(k => [k, after[k]]))));
  log(`   ${who} API rows:`, JSON.stringify(api));
  const flash = early.filter(e => (e.vendors ?? 0) > (api.vendors ?? 0) || (e.invoices ?? 0) > (api.invoices ?? 0) || (e.leads ?? 0) > (api.leads ?? 0));
  check(flash.length === 0, `C3 ${who}: first 4 s after sign-in never held Admin-sized vendors/invoices/leads in the cache`);
  check(after._user && after._user.toLowerCase() === E[`TEST_${who}_EMAIL`].toLowerCase(), `C3 ${who}: prismora_user is the new user`);
  compare(`C3 ${who}`, after, api);
  const shown = await admin.locator('body').innerText();
  check(!/TEST Admin\b/.test(shown.split('\n').slice(0, 40).join('\n')), `C3 ${who}: header does not show TEST Admin`);
  await signOut(admin);
}

// C4 two tabs: tab A stays open as Admin; tab B signs out and signs in as Sales Exec 1.
log('C4 two tabs in one browser profile');
const tabA = admin; // currently on /login
await tabA.fill('input[type="email"], input[name="email"], input[type="text"]', E.TEST_ADMIN_EMAIL);
await tabA.fill('input[type="password"]', E.TEST_ADMIN_PASSWORD);
await tabA.click('button[type="submit"]'); await tabA.waitForTimeout(5000);
await tabA.goto(BASE + '/accounting', { waitUntil: 'domcontentloaded' }); await settle(tabA);
const tabB = await ctx.newPage();
await tabB.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await settle(tabB);
await signOut(tabB);
await signInSamePage(tabB, 'SALES_EXEC_1');
await tabA.waitForTimeout(8000);
const aText = await tabA.locator('body').innerText();
const aUrl = tabA.url();
const shared = await cacheCounts(tabB);
const apiSE = await apiCounts('SALES_EXEC_1');
log(`   tab A url ${aUrl}; tab A shows "Accounting"? ${/Accounting/.test(aText)}; shows TEST Admin? ${/TEST Admin/.test(aText)}; shows Sales Exec 1? ${/TEST Sales Exec(utive)? 1/.test(aText)}`);
log('   shared cache now:', JSON.stringify(Object.fromEntries(Object.keys(TABLES).map(k => [k, shared[k]]))), 'user', shared._user);
compare('C4 shared cache after tab B switched user', shared, apiSE);
// Does tab A (still mounted for Admin) keep Admin data on screen after the account changed under it?
const invRowsA = await tabA.locator('table tbody tr').count();
log(`   tab A table rows on screen: ${invRowsA}`);
// Reload tab A: it must now be Sales Exec 1, with no Admin screen.
await tabA.reload({ waitUntil: 'domcontentloaded' }); await settle(tabA);
const aText2 = await tabA.locator('body').innerText();
check(!/TEST Admin/.test(aText2), 'C4 tab A after reload is not Admin');
log(`   tab A after reload url ${tabA.url()}`);

log(`\nCACHE: ${pass} pass, ${fail} fail`);
await ctx.browser().close();
