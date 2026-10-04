// Migration 084 (GRN lines locked, expense date not in the future) proven as the real roles. Harness copied from
// fix-batch-15b/dryrun.mjs: migration installed INSIDE a transaction, each scenario its own sub-transaction as the
// user (e-mail AND auth id, checked), everything rolled back. Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';  // 'live' = against the applied DB, no migration installed
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const AD = env.TEST_ADMIN_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL, AC = env.TEST_ACCOUNTS_EMAIL;

const NEEM = 'TEST Neem Face Wash 100ml';
const grn = (id, lines) => `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('${id}','TEST-PO-1','TEST Herbal Raw Materials Co','${JSON.stringify(lines)}'::jsonb, now())`;
const line = (batch, n) => ({ product: NEEM, quantity: n, receivedQty: n, orderedQty: 200, unitCost: 70, batchNumber: batch });
const batchQty = (batch) => `(SELECT coalesce(sum(quantity),0) FROM inventory WHERE "batchNumber"='${batch}')`;
const vendor = `(SELECT "outstandingAmount" FROM vendors WHERE id='TEST-V-1')`;
const grnMoves = (id) => `(SELECT count(*) FROM stock_movements WHERE "grnId"='${id}')`;
const state = (batch) => `'vendor '||${vendor}||', batch '||${batchQty(batch)}`;
// India-time moments: today's day at hh:mm, plus d days.
const ist = (d, hhmm) => `(((now() AT TIME ZONE 'Asia/Kolkata')::date + ${d} + time '${hhmm}') AT TIME ZONE 'Asia/Kolkata')`;
const exp = (id, when) => `INSERT INTO expenses(id,category,amount,description,date) VALUES ('${id}','Travel',10,'TEST B17 dry run',${when})`;
const expDate = (id) => `(SELECT to_char(date AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') FROM expenses WHERE id='${id}')`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// Vendor TEST-V-1 owes 4839 before; a GRN of 3 x 70 adds 210 -> 5049.
S(PM, 'G1 PM changes a GRN quantity (3 -> 30): refused, stock and balance as received',
  `UPDATE grn SET items='${JSON.stringify([line('TEST-G1', 30)])}'::jsonb WHERE id='GRN-G1'`, 'refused', {
  setup: grn('GRN-G1', [line('TEST-G1', 3)]), msg: 'cannot be changed after it is recorded' });
S(AD, 'G2 Admin changes a GRN vendor name: refused', `UPDATE grn SET "vendorName"='Someone Else' WHERE id='GRN-G2'`, 'refused', {
  setup: grn('GRN-G2', [line('TEST-G2', 3)]), msg: 'cannot be changed after it is recorded' });
S(PM, 'G3 PM moves a GRN to another PO: refused', `UPDATE grn SET "poId"=NULL WHERE id='GRN-G3'`, 'refused', {
  setup: grn('GRN-G3', [line('TEST-G3', 3)]), msg: 'cannot be changed after it is recorded' });
S(PM, 'G4 PM edits notes and received date: allowed, stock and balance unchanged',
  `UPDATE grn SET notes='TEST B17 note', "receivedDate"=now() - interval '1 day' WHERE id='GRN-G4'`, 'ok', {
  setup: grn('GRN-G4', [line('TEST-G4', 3)]),
  assert: `(SELECT notes FROM grn WHERE id='GRN-G4')='TEST B17 note' AND ${batchQty('TEST-G4')}=3 AND ${vendor}=5049 AND ${grnMoves('GRN-G4')}=1`, show: state('TEST-G4') });
S(PM, 'G5 The way to fix a wrong GRN: delete (stock out, balance back) and record again', `DELETE FROM grn WHERE id='GRN-G5'; ${grn('GRN-G5b', [line('TEST-G5', 2)])}`, 'ok', {
  setup: grn('GRN-G5', [line('TEST-G5', 3)]),
  assert: `${batchQty('TEST-G5')}=2 AND ${vendor}=4979`, show: state('TEST-G5') });
S(PM, 'G6 Maintenance (no app user) can still correct a GRN line', `SELECT 1`, 'ok', {
  setup: `${grn('GRN-G6', [line('TEST-G6', 3)])}; UPDATE grn SET items='${JSON.stringify([line('TEST-G6', 4)])}'::jsonb WHERE id='GRN-G6'`,
  assert: `(SELECT (items->0->>'quantity')::int FROM grn WHERE id='GRN-G6')=4` });

S(AC, 'E1 Accounts logs an expense dated tomorrow: refused', exp('EXP-TEST-B17-1', ist(1, '10:00')), 'refused', { msg: 'is in the future' });
S(AC, 'E2 Accounts logs an expense dated today (as the form sends it: 05:30 IST)', exp('EXP-TEST-B17-2', ist(0, '05:30')), 'ok', {
  assert: `${expDate('EXP-TEST-B17-2')} IS NOT NULL`, show: expDate('EXP-TEST-B17-2') });
S(AC, 'E3 Accounts logs an expense dated yesterday', exp('EXP-TEST-B17-3', ist(-1, '05:30')), 'ok');
S(AC, 'E4 Accounts logs one at 23:59 IST today: allowed', exp('EXP-TEST-B17-4', ist(0, '23:59')), 'ok');
S(AC, 'E5 Accounts logs one at 00:01 IST tomorrow: refused', exp('EXP-TEST-B17-5', ist(1, '00:01')), 'refused', { msg: 'is in the future' });
S(AC, 'E6 Accounts moves an expense date to next week: refused', `UPDATE expenses SET date=${ist(7, '05:30')} WHERE id='EXP-TEST-B17-6'`, 'refused', {
  setup: exp('EXP-TEST-B17-6', ist(0, '05:30')), msg: 'is in the future' });
S(AC, 'E7 An old row already dated ahead: other fields still editable', `UPDATE expenses SET description='TEST B17 edited' WHERE id='EXP-TEST-B17-7'`, 'ok', {
  setup: exp('EXP-TEST-B17-7', ist(3, '05:30')),
  assert: `(SELECT description FROM expenses WHERE id='EXP-TEST-B17-7')='TEST B17 edited'` });

const mig = readFileSync('D:/PRISMORA/migrations/084_grn_edit_and_expense_date.sql', 'utf8');
const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; a text; s text; c text; BEGIN\n`;
if (mode === 'with') body += `  EXECUTE $mig$${mig}$mig$;\n`;
for (const st of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    ${st.setup ? `EXECUTE '${q(st.setup)}';` : ''}
    SELECT jsonb_build_object('role', 'authenticated', 'email', lower(u.email), 'sub', u.id)::text INTO c
      FROM auth.users u WHERE lower(u.email) = lower('${st.email}');
    IF c IS NULL THEN RAISE EXCEPTION 'IDENTITY-NOT-SET: no sign-in for ${st.email}'; END IF;
    PERFORM set_config('request.jwt.claims', c, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF auth.uid() IS NULL OR public.current_app_email() IS NULL THEN
      RAISE EXCEPTION 'IDENTITY-NOT-SET: auth.uid()=% email=%', auth.uid(), public.current_app_email();
    END IF;
    EXECUTE '${q(st.stmt)}'; GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    a := ''; s := '';
    ${st.assert ? `EXECUTE 'SELECT coalesce((${q(st.assert)})::text, ''null'')' INTO a; a := ' ASSERT=' || a;` : ''}
    ${st.show ? `EXECUTE 'SELECT coalesce((${q(st.show)})::text, ''null'')' INTO s; s := ' {' || s || '}';` : ''}
    rep := rep || E'\\n' || '${q(st.id)} [want ${st.expect}] => DONE rows=' || n || a || s;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\\n' || '${q(st.id)} [want ${st.expect}] => REFUSED: ' || replace(left(SQLERRM, 240), E'\\n', ' '); END IF;
  END;\n`;
}
body += `  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;\nEND $dry$;\n`;

const dir = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/4d843ece-31f1-47c6-bea9-1683f83321a5/scratchpad';
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun17.sql`;
writeFileSync(f, body);
let raw = '';
for (let i = 0; i < 4 && !/DRYRUN-REPORT/.test(raw); i++) {
  try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${f} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
  catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
  if (raw.trim() && !/DRYRUN-REPORT/.test(raw)) break;
}
unlinkSync(f);
const m = raw.match(/DRYRUN-REPORT([\s\S]*)/);
if (!m) { console.log('no report returned:\n' + raw.slice(0, 3000)); process.exit(1); }
const text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\nCONTEXT')[0];
let bad = 0, seen = 0;
const byId = Object.fromEntries(steps.map(s => [s.id, s]));
for (const ln of text.split('\n')) {
  const mm = ln.match(/^\s*(.+?) \[want ([^\]]+)\] => (.*)$/);
  if (!mm) continue;
  const st = byId[mm[1]]; if (!st) continue; seen++;
  const refused = mm[3].startsWith('REFUSED'), rows0 = /rows=0\b/.test(mm[3]) && !/^\s*SELECT/.test(st.stmt) && !st.allow0;
  let ok = mm[2] === 'refused' ? refused : (!refused && !rows0);
  if (/IDENTITY-NOT-SET/.test(mm[3])) ok = false;
  if (ok && st.msg && refused && !mm[3].includes(st.msg)) ok = false;
  if (ok && st.assert && !/ASSERT=true/.test(mm[3])) ok = false;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mm[1]} => ${mm[3].replace(/\\$/, '')}`);
}
console.log(`\nmode: ${mode} migration; ${seen}/${steps.length} scenarios parsed; everything rolled back`);
if (seen !== steps.length) { console.log('INVALID RUN: not every scenario reported'); process.exit(1); }
console.log(bad ? `${bad} scenario(s) not as required` : 'all as required');
process.exit(bad ? 1 : 0);
