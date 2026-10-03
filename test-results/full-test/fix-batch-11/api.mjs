// Fix batch 11 (077 + create-user): the API as the real roles, every outcome confirmed in the database.
// Usage: node api.mjs   (no browser). TEST rows: role 'TEST B11 Full' (made and removed here),
// complaint CMP-TEST-B11-API (made and deleted here), events EV-TEST-B11-API-* (kept: audit rows).
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const kv = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const E = kv('D:/PRISMORA/.env.test-accounts.local'), V = kv('D:/PRISMORA/.env');
function db(sql) {
  const f = `${tmpdir()}/api11-${Date.now()}.sql`.replace(/\\/g, '/');
  writeFileSync(f, sql);
  for (let i = 0; i < 3; i++) {
    const raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}" 2>/dev/null`, { cwd: 'D:/PRISMORA', encoding: 'utf8', shell: 'bash' });
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'))); unlinkSync(f); return j.rows; } catch { /* empty answer: retry */ }
  }
  unlinkSync(f); throw new Error('db query returned nothing 3 times');
}
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const as = async (role) => {
  const c = createClient(V.VITE_SUPABASE_URL, V.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: E[`TEST_${role}_EMAIL`], password: E[`TEST_${role}_PASSWORD`] });
  if (error) throw new Error(`${role} sign-in failed`);
  return c;
};
const SE2 = 'U-TEST-SALES-EXEC-2';
const sa = await as('SUPER_ADMIN'), ad = await as('ADMIN');

// ── 1. Settings = full ──
let r = await ad.from('roles').update({ permissions: { ...(db(`SELECT permissions FROM roles WHERE id='Sales'`)[0].permissions), settings: 'full' } }).eq('id', 'Sales').select('id');
check('A1 Admin gives role Sales Settings=full: refused', !!r.error && /Only a Super Admin/.test(r.error.message) && db(`SELECT permissions->>'settings' s FROM roles WHERE id='Sales'`)[0].s === 'none', r.error?.message || JSON.stringify(r.data));
r = await ad.from('roles').insert([{ id: 'TEST B11 Admin-made', name: 'TEST B11 Admin-made', permissions: { settings: 'full' }, level: 'staff' }]).select('id');
check('A2 Admin creates a Settings=full role: refused', !!r.error && db(`SELECT count(*)::int n FROM roles WHERE id='TEST B11 Admin-made'`)[0].n === 0, r.error?.message || 'inserted');
r = await sa.from('roles').insert([{ id: 'TEST B11 Full', name: 'TEST B11 Full', permissions: { settings: 'full' }, level: 'staff', active: true }]).select('id');
check('A3 Super Admin creates Settings=full role TEST B11 Full', !r.error && db(`SELECT count(*)::int n FROM roles WHERE id='TEST B11 Full'`)[0].n === 1, r.error?.message || 'ok');
const inv = await ad.functions.invoke('create-user', { body: { email: 'test-b11-api@prismora.test', password: 'TestB11pass1', name: 'TEST B11 API', role: 'TEST B11 Full' } });
const invMsg = inv.error ? await inv.error.context?.json?.().then(j => j.error).catch(() => inv.error.message) : JSON.stringify(inv.data);
check('A4 Admin create-user with a Settings=full role: 403, no account', !!inv.error && /Only a Super Admin/.test(invMsg) && db(`SELECT (SELECT count(*) FROM users WHERE email='test-b11-api@prismora.test')+(SELECT count(*) FROM auth.users WHERE email='test-b11-api@prismora.test') n`)[0].n == 0, invMsg);
r = await ad.from('users').update({ role: 'TEST B11 Full' }).eq('id', SE2).select('id');
check('A5 Admin gives Sales Exec 2 the Settings=full role: refused', !!r.error && db(`SELECT role FROM users WHERE id='${SE2}'`)[0].role === 'Sales Executive', r.error?.message || 'updated');
r = await ad.from('roles').delete().eq('id', 'TEST B11 Full').select('id');
check('A6 Admin deletes the Settings=full role: refused', !!r.error && db(`SELECT count(*)::int n FROM roles WHERE id='TEST B11 Full'`)[0].n === 1, r.error?.message || 'deleted');
r = await ad.from('users').update({ role: 'Sales' }).eq('id', SE2).select('id');
const backOk = (await ad.from('users').update({ role: 'Sales Executive' }).eq('id', SE2).select('id')).error == null;
check('A7 Admin control: Sales Exec 2 -> Sales -> back to Sales Executive', !r.error && backOk && db(`SELECT role FROM users WHERE id='${SE2}'`)[0].role === 'Sales Executive', r.error?.message || 'ok');
r = await sa.from('roles').delete().eq('id', 'TEST B11 Full').select('id');
check('A8 Super Admin deletes TEST B11 Full', !r.error && db(`SELECT count(*)::int n FROM roles WHERE id='TEST B11 Full'`)[0].n === 0, r.error?.message || 'ok');

// ── 2. Events from every role ──
const evRoles = [['SALES_EXEC_1', 'expense_new'], ['SALES', 'lead_new'], ['DISPATCH', 'order_shipped'], ['WAREHOUSE', 'sales_return'],
  ['PURCHASE_MANAGER', 'po_created'], ['CUSTOMER_SUPPORT', 'complaint_updated'], ['DISTRIBUTOR', 'complaint_registered'],
  ['DEALER', 'order_receipt_confirmed'], ['RETAILER', 'claim_submitted']];
const stamp = Date.now();
for (const [role, type] of evRoles) {
  const c = await as(role);
  const id = `EV-TEST-B11-API-${role}-${stamp}`;
  const { error } = await c.from('events').insert([{ id, type, message: `TEST B11 API ${role}`, timestamp: '2020-01-01T00:00:00Z' }]);
  const row = db(`SELECT "actorEmail", "timestamp" > now() - interval '10 minutes' fresh FROM events WHERE id='${id}'`)[0];
  check(`E ${role} logs ${type}: saved, actor = own e-mail, time = now`, !error && row?.actorEmail === E[`TEST_${role}_EMAIL`].toLowerCase() && row?.fresh === true, error?.message || JSON.stringify(row));
}
const se1 = await as('SALES_EXEC_1');
r = await se1.from('events').insert([{ id: `EV-TEST-B11-API-MONEY-${stamp}`, type: 'invoice_new', message: 'TEST B11 API money' }]);
check('E Sales Exec 1 logs a money event: refused', !!r.error && db(`SELECT count(*)::int n FROM events WHERE id='EV-TEST-B11-API-MONEY-${stamp}'`)[0].n === 0, r.error?.message || 'inserted');

// ── 3. Complaint delete ──
r = await ad.from('complaints').insert([{ id: 'CMP-TEST-B11-API', complaintType: 'Product Quality', customerName: 'TEST B11 API Customer', distributorId: 'D-TEST-1', assignedTo: 'U-TEST-SALES-EXEC-1', status: 'Open' }]).select('id');
check('C0 Admin registers TEST complaint CMP-TEST-B11-API', !r.error, r.error?.message || 'ok');
for (const role of ['CUSTOMER_SUPPORT', 'SALES_EXEC_1', 'DISTRIBUTOR', 'DIRECTOR']) {
  const c = await as(role);
  const d = await c.from('complaints').delete().eq('id', 'CMP-TEST-B11-API').select('id');
  check(`C ${role} deletes it: nothing deleted, row kept`, !d.data?.length && db(`SELECT count(*)::int n FROM complaints WHERE id='CMP-TEST-B11-API'`)[0].n === 1, d.error?.message || `rows=${d.data?.length}`);
}
r = await ad.from('complaints').delete().eq('id', 'CMP-TEST-B11-API').select('id');
check('C Admin deletes it: 1 row, gone in DB', r.data?.length === 1 && db(`SELECT count(*)::int n FROM complaints WHERE id='CMP-TEST-B11-API'`)[0].n === 0, r.error?.message || `rows=${r.data?.length}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} as required`);
process.exit(results.every(Boolean) ? 0 : 1);
