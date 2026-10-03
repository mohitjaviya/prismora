// Fix batch 10: the screens and the API, as the real roles, every outcome confirmed in the database.
// Usage: BASE=http://localhost:5174 node ui.mjs   (BASE defaults to local dev)
// Leaves TEST rows behind on purpose (listed at the end) so they can be checked, then cleaned by cleanup SQL.
import { login, go, browser, E } from '../phase3/lib.mjs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

function db(sql) {
  const f = `${tmpdir()}/ui10-${Date.now()}.sql`.replace(/\\/g, '/');
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

const EXEC1 = 'U-TEST-SALES-EXEC-1', MGR = 'U-TEST-SALES-MANAGER', PUNE = 'T-TEST-PUNE';
const NEEM = 'TEST Neem Face Wash 100ml';
const start = new Date(Date.now() - 60000).toISOString();

// PID=O123 skips steps 1-3 and splits an order already placed by step 1.
let page;
let PID = process.env.PID;
if (!PID) {
// ── 1. Distributor 2 (Pune) places a portal order on screen ──
page = await login('DISTRIBUTOR_2');
await go(page, '/orders');
await page.getByRole('button', { name: 'Place New Order' }).click();
const neemValue = await page.locator('#distributororders-product option', { hasText: NEEM }).first().getAttribute('value');
await page.selectOption('#distributororders-product', neemValue);
await page.fill('#distributororders-qty', '600');
await page.locator('button', { hasText: /^Add$/ }).click();
await page.getByRole('button', { name: 'Submit Order' }).click();
const portal = await waitFor(() => db(`SELECT id, "assignedTo", "territoryId", quantity FROM orders WHERE "distributorId"='D-TEST-2' AND "createdAt" > '${start}' ORDER BY "createdAt" DESC LIMIT 1`)[0]);
check('U1 Distributor 2 portal order: owner Sales Exec 1, territory TEST Pune Zone (DB)', portal?.assignedTo === EXEC1 && portal?.territoryId === PUNE && Number(portal?.quantity) === 600,
  JSON.stringify(portal));
PID = portal?.id;
await page.context().close();

// ── 2. Sales Exec 1 and the Sales Manager now see it in Orders ──
for (const [role, id] of [['SALES_EXEC_1', 'U2'], ['SALES_MANAGER', 'U3']]) {
  page = await login(role);
  await go(page, '/orders');
  const seen = await page.locator(`#order-row-${PID}`).count() + await page.locator('tr', { hasText: PID }).count();
  check(`${id} ${role} sees portal order ${PID} in the Orders list`, seen > 0, `rows matching ${PID}: ${seen}`);
  if (role === 'SALES_MANAGER') {
    // ── 3. Sales Manager's own order: Assign To defaults to "Me", and saves as the manager ──
    await page.getByRole('button', { name: /Add Order|New Order/ }).first().click();
    await page.waitForSelector('#orders-assign-to');
    const def = await page.inputValue('#orders-assign-to');
    const label = await page.locator('#orders-assign-to option:checked').innerText();
    check('U4 Sales Manager: Assign To defaults to the manager', def === MGR, `value=${def} label="${label}"`);
    await page.fill('#orders-customer-name', 'TEST B10 SM own order');
    await page.selectOption('select:has(option[value="__ADD_NEW__"])', NEEM);
    await page.fill('#orders-quantity', '1');
    await page.fill('#orders-order-value', '110');
    await page.selectOption('#orders-state', 'Gujarat').catch(() => {});
    await page.fill('#orders-city', 'Surat');
    await page.locator('form button[type="submit"]').last().click();
    const own = await waitFor(() => db(`SELECT id, "assignedTo" FROM orders WHERE "customerName"='TEST B10 SM own order' ORDER BY "createdAt" DESC LIMIT 1`)[0]);
    await go(page, '/orders');
    const listed = own ? await page.locator('tr', { hasText: own.id }).count() : 0;
    check('U5 Sales Manager own order saved with the manager as owner, and listed', own?.assignedTo === MGR && listed > 0, `${JSON.stringify(own)}; listed=${listed}; toasts="${(await toasts(page)).slice(0, 120)}"`);
  }
  await page.context().close();
}
}

// ── 4. Admin: Split into Backorder, Confirm double-clicked ──
// Split is offered when a stage that needs stock is chosen and stock is short:
// Admin takes the partner order to Processing (the Batch 5 step), then picks Ready for Dispatch.
page = await login('ADMIN');
const openEdit = async () => {
  await go(page, '/orders');
  await page.locator('tr', { hasText: PID }).locator('button[title="Edit order"]').first().click();
  await page.waitForSelector('#orders-status');
};
await openEdit();
if (await page.inputValue('#orders-status') === 'Pending') {
  if (!(await page.inputValue('#orders-delivery-address')).trim()) await page.fill('#orders-delivery-address', 'TEST address, Pune');
  if (!(await page.inputValue('#orders-pincode')).trim()) await page.fill('#orders-pincode', '411001');
  await page.selectOption('#orders-status', 'Processing');
  await page.locator('form button[type="submit"]').last().click();
  await waitFor(() => db(`SELECT 1 FROM orders WHERE id='${PID}' AND status='Processing'`)[0]);
  await openEdit();
}
await page.selectOption('#orders-status', 'Ready for Dispatch');
await page.getByRole('button', { name: 'Split into Backorder' }).click();
const confirmBtn = page.getByRole('button', { name: 'Confirm Split' });
await confirmBtn.dblclick();
await page.waitForTimeout(500);
const busyLabel = await page.locator('button', { hasText: 'Splitting…' }).count();
const splits = await waitFor(() => { const r = db(`SELECT count(*)::int n, string_agg(id||':'||quantity,',') ids FROM orders WHERE "splitFromOrderId"='${PID}'`)[0]; return r && r.n >= 1 ? r : null; });
await page.waitForTimeout(6000);
const after = db(`SELECT count(*)::int n, string_agg(id||':'||quantity||':'||status,',') ids, (SELECT quantity||' into '||coalesce("splitIntoOrderId",'-') FROM orders WHERE id='${PID}') parent FROM orders WHERE "splitFromOrderId"='${PID}'`)[0];
check('U6 Double-click on Confirm Split makes exactly one backorder (DB)', after.n === 1, `backorders=${after.ids}; parent ${PID}: ${after.parent}; "Splitting…" shown=${busyLabel}; first seen ${splits?.ids}`);
const BACK = (after.ids || '').split(':')[0];
await page.context().close();

// ── 5. API, no screen: two simultaneous backorder inserts as Admin (what a double click sends) ──
const envFile = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sb = createClient(envFile.VITE_SUPABASE_URL, envFile.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signErr } = await sb.auth.signInWithPassword({ email: E.TEST_ADMIN_EMAIL, password: E.TEST_ADMIN_PASSWORD });
if (signErr) throw new Error('Admin sign-in failed');
// The open backorder is cancelled first so this case starts with none.
await sb.from('orders').update({ status: 'Cancelled' }).eq('id', BACK);
const row = (n) => ({ customerName: `TEST B10 parallel ${n}`, product: NEEM, quantity: 1, value: 110, status: 'Processing', splitFromOrderId: PID, deliveryAddress: 'TEST address', deliveryPincode: '411001', assignedTo: EXEC1 });
const both = await Promise.all([1, 2].map(n => sb.from('orders').insert([row(n)]).select('id').single()));
const okN = both.filter(r => !r.error).length;
const errs = both.filter(r => r.error).map(r => r.error.message);
const open = db(`SELECT count(*)::int n FROM orders WHERE "splitFromOrderId"='${PID}' AND status NOT IN ('Cancelled','Delivered')`)[0].n;
check('U7 Two simultaneous backorder inserts: one saved, one refused (DB)', okN === 1 && open === 1, `saved=${okN}; refusal="${errs.join(' / ').slice(0, 160)}"; open backorders=${open}`);

// ── 6. Partner can no longer pick the owner through the API ──
const p2 = createClient(envFile.VITE_SUPABASE_URL, envFile.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await p2.auth.signInWithPassword({ email: E.TEST_DISTRIBUTOR_2_EMAIL, password: E.TEST_DISTRIBUTOR_2_PASSWORD });
const { data: forged, error: fErr } = await p2.from('orders').insert([{ customerName: 'TEST B10 forged owner', product: NEEM, quantity: 1, value: 1, status: 'Pending', items: [{ name: NEEM, quantity: 1 }], distributorId: 'D-TEST-2', assignedTo: 'U-TEST-ADMIN' }]).select('id, assignedTo, territoryId').single();
check('U8 Distributor 2 sends assignedTo=Admin through the API: DB puts Sales Exec 1', !fErr && forged?.assignedTo === EXEC1 && forged?.territoryId === PUNE, JSON.stringify(forged || fErr?.message));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
console.log(`TEST rows to clean: orders with "splitFromOrderId"='${PID}', '${PID}', customerName LIKE 'TEST B10 %'`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
