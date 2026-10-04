// Fix batch 16 (migration 083) proven as the real roles. Harness copied from fix-batch-15c/dryrun.mjs: migration
// installed INSIDE a transaction, each scenario its own sub-transaction as the user (e-mail AND auth id, checked),
// everything rolled back. TEST incentives are created in each step's setup (as maintenance).
// Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const AC = env.TEST_ACCOUNTS_EMAIL, AD = env.TEST_ADMIN_EMAIL, DI = env.TEST_DISTRIBUTOR_EMAIL, DE = env.TEST_DEALER_EMAIL, CS = env.TEST_CUSTOMER_SUPPORT_EMAIL;

const BALM = 'TEST Unrated Balm 25g', SCH = 'SCH-1790706947005';
const inc = (id, party, type, value, product = null, order = 'O100') =>
  `INSERT INTO distributor_incentives(id,"distributorId","schemeId","schemeName","orderId","orderValue","incentiveType","incentiveValue","incentiveProduct",status) VALUES ('${id}','${party}','${SCH}','TEST B16 scheme','${order}',1100,'${type}',${value},${product ? `'${product}'` : 'NULL'},'Earned')`;
const CASH = inc('INC-B16-CASH', 'D-TEST-1', 'Discount', 55);
const FREE = inc('INC-B16-FREE', 'D-TEST-1', 'Free Goods', 2, BALM, 'O101');
const OTHER = inc('INC-B16-OTHER', 'D-TEST-2', 'Discount', 40, null, 'O118');
const claim = (inc, amount, party = 'D-TEST-1') => `INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,notes) VALUES ('CLM-B16-'||floor(random()*1e9)::bigint,'${party}',${inc ? `'${inc}'` : 'NULL'},${amount},'TEST B16')`;
const balm = `(SELECT sum(quantity) FROM inventory WHERE product='${BALM}')`;
const status = (id) => `(SELECT status FROM distributor_incentives WHERE id='${id}')`;
const expense = (id) => `(SELECT category||' '||amount FROM expenses WHERE id='EXP-${id}')`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Paying an incentive ──
S(AC, 'P1 Accounts pays a ₹55 cash incentive: expense booked, Paid', `SELECT pay_incentive('INC-B16-CASH')`, 'ok', {
  setup: CASH, assert: `${status('INC-B16-CASH')}='Paid' AND ${expense('INC-B16-CASH')}='Scheme Incentive 55'`, show: expense('INC-B16-CASH') });
S(AC, 'P2 Accounts (no Inventory access) pays 2 free Balm: the units leave stock', `SELECT pay_incentive('INC-B16-FREE')`, 'ok', {
  setup: FREE, assert: `${status('INC-B16-FREE')}='Paid' AND ${balm}=53 AND (SELECT sum(quantity) FROM stock_movements WHERE "incentiveId"='INC-B16-FREE' AND kind='free_goods' AND "createdBy"='U-TEST-ACCOUNTS')=2 AND ${expense('INC-B16-FREE')} IS NULL`,
  show: `'Balm 55 -> '||${balm}` });
S(AC, 'P3 Paying the same incentive twice', `SELECT pay_incentive('INC-B16-CASH'); SELECT pay_incentive('INC-B16-CASH')`, 'refused', { setup: CASH, msg: 'cannot be paid again' });
S(AC, 'P4 Free goods with too little sellable stock (1000 units)', `SELECT pay_incentive('INC-B16-BIG')`, 'refused', {
  setup: inc('INC-B16-BIG', 'D-TEST-1', 'Free Goods', 1000, BALM, 'O102'), msg: 'sellable units' });
S(DI, 'P5 Distributor pays its own incentive', `SELECT pay_incentive('INC-B16-CASH')`, 'refused', { setup: CASH, msg: 'full Incentives access' });
S(AC, 'P6 Accounts marks an incentive Paid directly', `UPDATE distributor_incentives SET status='Paid' WHERE id='INC-B16-CASH'`, 'refused', { setup: CASH, msg: 'cannot be edited directly' });
S(AD, 'P7 Admin adds an incentive by hand', inc('INC-B16-HAND', 'D-TEST-1', 'Discount', 999, null, 'O104'), 'refused', { msg: 'earned by orders' });
S(AD, 'P8 Admin pays (Inventory full too): same result', `SELECT pay_incentive('INC-B16-FREE')`, 'ok', { setup: FREE, assert: `${balm}=53` });
// ── 2. Claims ──
S(DI, 'C1 Distributor claims ₹30 of its ₹55 incentive: scheme/order taken from the incentive', claim('INC-B16-CASH', 30), 'ok', {
  setup: CASH, assert: `(SELECT count(*) FROM scheme_claims WHERE "incentiveId"='INC-B16-CASH' AND amount=30 AND status='Pending' AND "schemeName"='TEST B16 scheme' AND "orderId"='O100')=1` });
S(DI, 'C2 Claim for more than the incentive is worth', claim('INC-B16-CASH', 100), 'refused', { setup: CASH, msg: 'can be at most' });
S(DI, 'C3 Claim that names no incentive', claim(null, 30), 'refused', { msg: 'must name the incentive' });
S(DI, 'C4 Claim on another partner\'s incentive', claim('INC-B16-OTHER', 10), 'refused', { setup: OTHER, msg: 'another partner' });
S(DI, 'C5 Second claim on the same incentive', `${claim('INC-B16-CASH', 10)}; ${claim('INC-B16-CASH', 10)}`, 'refused', { setup: CASH, msg: 'already has claim' });
S(DI, 'C6 Claim on an incentive already paid', claim('INC-B16-CASH', 10), 'refused', { setup: `${CASH}; UPDATE distributor_incentives SET status='Paid' WHERE id='INC-B16-CASH'`, msg: 'cannot be claimed' });
S(AC, 'C7 Accounts settles the ₹30 claim: incentive paid once, ₹30 expense (Scheme Claim)', `UPDATE scheme_claims SET status='Settled' WHERE "incentiveId"='INC-B16-CASH'`, 'ok', {
  setup: `${CASH}; INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,status,"schemeId","schemeName") VALUES ('CLM-B16-S','D-TEST-1','INC-B16-CASH',30,'Pending','${SCH}','TEST B16 scheme')`,
  assert: `${status('INC-B16-CASH')}='Paid' AND ${expense('INC-B16-CASH')}='Scheme Claim 30'`, show: expense('INC-B16-CASH') });
S(AC, 'C8 A settled claim moved back to Approved', `UPDATE scheme_claims SET status='Approved' WHERE id='CLM-B16-S'`, 'refused', {
  setup: `${CASH}; INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,status,"schemeName") VALUES ('CLM-B16-S','D-TEST-1','INC-B16-CASH',30,'Settled','TEST B16 scheme')`, msg: 'settled claim is final' });
S(AC, 'C9 Free-goods claim (amount set to 0) settled: units leave stock', `UPDATE scheme_claims SET status='Settled' WHERE "incentiveId"='INC-B16-FREE'`, 'ok', {
  setup: `${FREE}; INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,status,"schemeName") VALUES ('CLM-B16-F','D-TEST-1','INC-B16-FREE',0,'Pending','TEST B16 scheme')`,
  assert: `${status('INC-B16-FREE')}='Paid' AND ${balm}=53` });
S(DI, 'C10 Free-goods claim: amount typed is replaced by 0', claim('INC-B16-FREE', 500), 'ok', { setup: FREE, assert: `(SELECT amount FROM scheme_claims WHERE "incentiveId"='INC-B16-FREE')=0` });
S(DI, 'C11 After a rejected claim the incentive can be claimed again', claim('INC-B16-CASH', 20), 'ok', {
  setup: `${CASH}; INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,status,"schemeName") VALUES ('CLM-B16-R','D-TEST-1','INC-B16-CASH',30,'Rejected','TEST B16 scheme')` });
S(AC, 'C12 Paying directly while a claim is open', `SELECT pay_incentive('INC-B16-CASH')`, 'refused', {
  setup: `${CASH}; INSERT INTO scheme_claims(id,"distributorId","incentiveId",amount,status,"schemeName") VALUES ('CLM-B16-O','D-TEST-1','INC-B16-CASH',30,'Pending','TEST B16 scheme')`, msg: 'open claim' });
S(AC, 'C13 Settling an old claim with no incentive', `UPDATE scheme_claims SET status='Settled' WHERE id='CLM-B16-L'`, 'refused', {
  setup: `INSERT INTO scheme_claims(id,"distributorId",amount,status,"schemeName") VALUES ('CLM-B16-L','D-TEST-1',20,'Pending','legacy')`, msg: 'before claims were tied' });
// ── 3. Complaints ──
S(DI, 'X1 Distributor complaint naming itself as assignee: stored unassigned', `INSERT INTO complaints("customerName",description,status,"distributorId","assignedTo","complaintType") VALUES ('TEST B16 X1','TEST','Open','D-TEST-1','U-TEST-DISTRIBUTOR','Quality')`, 'ok', {
  assert: `(SELECT "assignedTo" FROM complaints WHERE "customerName"='TEST B16 X1') IS NULL` });
S(CS, 'X2 Customer Support complaint keeps its assignee', `INSERT INTO complaints("customerName",description,status,"assignedTo","complaintType") VALUES ('TEST B16 X2','TEST','Open','U-TEST-CUSTOMER-SUPPORT','Quality')`, 'ok', {
  assert: `(SELECT "assignedTo" FROM complaints WHERE "customerName"='TEST B16 X2')='U-TEST-CUSTOMER-SUPPORT'` });
// ── 4. Schemes partners can read ──
S(DI, 'S1 Distributor reads schemes: only the 1 Active scheme for Distributors', 'SELECT id FROM schemes', 'ok', { rows: 1 });
S(DE, 'S2 Dealer reads schemes: none apply to dealers', 'SELECT id FROM schemes', 'ok', { rows: 0, allow0: true });
S(AD, 'S3 Admin still reads all 3 schemes', 'SELECT id FROM schemes', 'ok', { rows: 3 });

const mig = readFileSync('D:/PRISMORA/migrations/083_partner_flow.sql', 'utf8');
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

const dir = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/8c0768fe-ab89-4b17-af16-16501b687d71/scratchpad';
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun16.sql`;
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
  if (ok && st.rows !== undefined && (mm[3].match(/rows=([0-9]+)/) || [])[1] !== String(st.rows)) ok = false;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mm[1]} => ${mm[3].replace(/\\$/, '')}`);
}
console.log(`\nmode: ${mode} migration; ${seen}/${steps.length} scenarios parsed; everything rolled back`);
if (seen !== steps.length) { console.log('INVALID RUN: not every scenario reported'); process.exit(1); }
console.log(bad ? `${bad} scenario(s) not as required` : 'all as required');
process.exit(bad ? 1 : 0);
