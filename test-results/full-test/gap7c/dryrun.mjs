// Migration 093 (Gap 7 C: record_partner_refund pays back a partner's credit balance) proven as the real
// roles. Harness = gap7/dryrun.mjs: migration installed INSIDE a transaction, each scenario its own
// sub-transaction as the user (e-mail AND auth id, checked), all rolled back.
// D-TEST-1 (credit -61,356.20), D-TEST-2 (owes 4,901), Demo Dealer (credit -2,500). Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const AC = env.TEST_ACCOUNTS_EMAIL, AD = env.TEST_ADMIN_EMAIL, SA = env.TEST_SUPER_ADMIN_EMAIL, SE = env.TEST_SALES_EXEC_1_EMAIL,
  D1 = env.TEST_DISTRIBUTOR_EMAIL, D2 = env.TEST_DISTRIBUTOR_2_EMAIL;

const P = 'D-TEST-1', OWES = 'D-TEST-2', DEALER = 'DEAL-1790054296840';
const bal = (id = P, t = 'distributors') => `(SELECT "outstandingAmount" FROM ${t} WHERE id='${id}')`;
const last = `(SELECT r FROM partner_refunds r ORDER BY "createdAt" DESC, id DESC LIMIT 1)`;
const uid = (email) => `(SELECT u.id FROM users u WHERE lower(u.email)=lower('${email}'))`;
const settledSum = `(SELECT coalesce(sum("amountPaid"),0) FROM invoices i LEFT JOIN orders o ON o.id=i."orderId" WHERE coalesce(i."distributorId",o."distributorId")='${P}')`;
const show = `'D-TEST-1 '||${bal()}||', derived '||public.partner_derived_balance('${P}')`;
const snap = `CREATE TEMP TABLE b093 ON COMMIT DROP AS SELECT ${bal()} o, ${settledSum} s`;
const asUser = (email, sql) => `SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','email',lower(email),'sub',id)::text FROM auth.users WHERE lower(email)=lower('${email}')), true); SET LOCAL ROLE authenticated; ${sql}; RESET ROLE`;
const today = `((now() AT TIME ZONE 'Asia/Kolkata')::date)`;
const call = (amount, { type = 'Distributor', party = P, date = today, method = `'Bank Transfer'`, ref = `'TEST-UTR-093'`, reason = `'TEST 093 credit paid back'` } = {}) =>
  `SELECT public.record_partner_refund('${type}', '${party}', ${amount}, ${date}, ${method}, ${ref}, ${reason})`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, setup: snap, show, ...o });

S(AC, 'R1 Accounts refunds Rs 1,000: one RFD row with every detail, recordedBy = Accounts, balance 1,000 nearer 0, Balance check still agrees, invoices unchanged',
  call(1000), 'ok', { assert: `${bal()}=(SELECT o FROM b093)+1000 AND (${last}).amount=1000 AND (${last}).id ~ '^RFD-[0-9]+' AND (${last})."distributorId"='${P}' AND (${last}).method='Bank Transfer' AND (${last}).reference='TEST-UTR-093' AND (${last}).reason='TEST 093 credit paid back' AND (${last})."recordedBy"=${uid(AC)} AND ((${last}).date AT TIME ZONE 'Asia/Kolkata')::date=${today} AND public.partner_derived_balance('${P}')=${bal()} AND ${settledSum}=(SELECT s FROM b093)` });
S(AC, 'R2 The whole credit refunded (61,356.20): balance exactly 0, all invoices still settled',
  call(61356.20), 'ok', { assert: `${bal()}=0 AND public.partner_derived_balance('${P}')=0 AND ${settledSum}=(SELECT s FROM b093)` });
S(AC, 'R3 More than the credit (61,356.21): refused', call(61356.21), 'refused', { msg: 'cannot be more than the credit balance' });
S(AC, 'R4 Second refund after the first used the credit up: refused (no credit left)', call(1), 'refused', {
  setup: `${snap}; ${asUser(AC, call(61356.20))}`, msg: 'has no credit balance' });
S(AC, 'R5 Partner who owes money (D-TEST-2): refused', call(100, { party: OWES }), 'refused', { msg: 'has no credit balance' });
S(AC, 'R6 Amount 0: refused', call(0), 'refused', { msg: 'more than zero' });
S(AC, 'R7 No reference: refused', call(100, { ref: `'  '` }), 'refused', { msg: 'reference' });
S(AC, 'R8 No reason: refused', call(100, { reason: `'ok'` }), 'refused', { msg: 'reason' });
S(AC, 'R9 No payment mode: refused', call(100, { method: 'NULL' }), 'refused', { msg: 'payment mode' });
S(AC, 'R10 No date: refused', call(100, { date: 'NULL' }), 'refused', { msg: 'date' });
S(AC, 'R11 Dated tomorrow: refused', call(100, { date: `${today}+1` }), 'refused', { msg: 'after today' });
S(SE, 'R12 Sales Executive cannot record a refund', call(100), 'refused', { msg: 'Only Accounts' });
S(D1, 'R13 The partner itself cannot record a refund', call(100), 'refused', { msg: 'Only Accounts' });
S(AD, 'R14 Admin can: recordedBy = Admin', call(250), 'ok', { assert: `(${last})."recordedBy"=${uid(AD)} AND ${bal()}=(SELECT o FROM b093)+250` });
S(SA, 'R15 Super Admin can', call(250), 'ok', { assert: `(${last})."recordedBy"=${uid(SA)} AND ${bal()}=(SELECT o FROM b093)+250` });
S(AC, 'R16 Dealer with a credit (Demo Dealer, -2,500): refund 500 -> -2,000',
  call(500, { type: 'Dealer', party: DEALER }), 'ok', { assert: `${bal(DEALER, 'dealers')}=-2000 AND (${last})."dealerId"='${DEALER}' AND (${last})."distributorId" IS NULL` });
S(AC, 'R17 Writing the table directly (not through the function): refused',
  `INSERT INTO partner_refunds (id,"distributorId",amount,date,method,reference,reason) VALUES ('RFD-TEST-DIRECT','${P}',100,now(),'Cash','x','direct')`, 'refused', { msg: 'permission denied' });
S(AC, 'R18 Deleting a refund directly: refused',
  `DELETE FROM partner_refunds`, 'refused', { setup: `${snap}; ${asUser(AC, call(100))}`, msg: 'permission denied' });
S(D1, 'R19 The partner reads its own refund', `SELECT 1 FROM partner_refunds WHERE "distributorId"='${P}'`, 'ok', {
  setup: `${snap}; ${asUser(AC, call(100))}`, wantRows: 1 });
S(D2, "R20 Another partner does not see it", `SELECT 1 FROM partner_refunds`, 'ok', {
  setup: `${snap}; ${asUser(AC, call(100))}`, allow0: true, wantRows: 0 });
S(SE, 'R21 Sales Executive (no Ledger/Accounting view) does not see it', `SELECT 1 FROM partner_refunds`, 'ok', {
  setup: `${snap}; ${asUser(AC, call(100))}`, allow0: true, wantRows: 0 });
S(AC, 'R22 Money paid back does not pay a later invoice: after refunding the whole credit, a new Rs 100 invoice stays Unpaid',
  `SELECT 1`, 'ok', {
  setup: `${snap}; ${asUser(AC, call(61356.20))}; INSERT INTO invoices (id,"customerName","distributorId",amount,tax,status,"createdAt") VALUES ('INV-TEST-093','TEST Distributor Pvt Ltd','${P}',100,0,'Unpaid',now())`,
  assert: `(SELECT "amountPaid" FROM invoices WHERE id='INV-TEST-093')=0 AND (SELECT status FROM invoices WHERE id='INV-TEST-093') IN ('Unpaid','Overdue')` });
S(AC, 'R23 Without a refund the same invoice is paid from the credit (control)',
  `SELECT 1`, 'ok', {
  setup: `${snap}; INSERT INTO invoices (id,"customerName","distributorId",amount,tax,status,"createdAt") VALUES ('INV-TEST-093','TEST Distributor Pvt Ltd','${P}',100,0,'Unpaid',now())`,
  assert: `(SELECT status FROM invoices WHERE id='INV-TEST-093')='Settled'` });
S(AC, 'R24 Refund is a money entry in the activity feed', `SELECT public.is_money_event('partner_refund')`, 'ok', { allow0: true,
  assert: `public.is_money_event('partner_refund')` });
S(AC, 'R25 The screen check partner_refund_enabled() answers', 'SELECT public.partner_refund_enabled()', 'ok', { allow0: true });

const mig = readFileSync('D:/PRISMORA/migrations/093_partner_refunds.sql', 'utf8');
const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; a text; s text; c text; BEGIN\n`;
if (mode === 'with') body += `  EXECUTE $mig$${mig}$mig$;\n`;
for (const st of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    ${st.setup ? `EXECUTE '${q(st.setup)}';` : ''}
    EXECUTE 'RESET ROLE';
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

const dir = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/30ef0262-6c7c-42a7-878a-76d8bd062cef/scratchpad';
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun093.sql`;
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
  if (ok && st.wantRows !== undefined && !new RegExp(`rows=${st.wantRows}\\b`).test(mm[3])) ok = false;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mm[1]} => ${mm[3].replace(/\\$/, '')}`);
}
console.log(`\nmode: ${mode} migration; ${seen}/${steps.length} scenarios parsed; everything rolled back`);
if (seen !== steps.length) { console.log('INVALID RUN: not every scenario reported'); process.exit(1); }
console.log(bad ? `${bad} scenario(s) not as required` : 'all as required');
process.exit(bad ? 1 : 0);
