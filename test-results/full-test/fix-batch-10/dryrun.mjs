// Fix batch 10 (migration 076) proven as the real roles. Harness copied from fix-batch-9/dryrun.mjs:
// migration installed INSIDE a transaction, each scenario its own sub-transaction, full identity
// (e-mail AND auth id) per step, and the whole block ends in RAISE EXCEPTION so nothing is kept.
// Usage: node dryrun.mjs [with|without]   ("without" = re-check once 076 is live, or show the old gaps)
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const DI = env.TEST_DISTRIBUTOR_EMAIL, DI2 = env.TEST_DISTRIBUTOR_2_EMAIL, DE = env.TEST_DEALER_EMAIL, DE2 = env.TEST_DEALER_2_EMAIL,
  RE = env.TEST_RETAILER_EMAIL, RE2 = env.TEST_RETAILER_2_EMAIL, P2E = env.TEST_P2E_DIST_EMAIL,
  SM = env.TEST_SALES_MANAGER_EMAIL, SE1 = env.TEST_SALES_EXEC_1_EMAIL, AD = env.TEST_ADMIN_EMAIL;

const GUJ = 'T-1790057083440', GUJ_EXEC = 'U1790051480499', PUNE = 'T-TEST-PUNE', EXEC1 = 'U-TEST-SALES-EXEC-1', EXEC2 = 'U-TEST-SALES-EXEC-2', MGR = 'U-TEST-SALES-MANAGER';
const NEEM = 'TEST Neem Face Wash 100ml';

// A partner order as the browser sends it: owner and territory deliberately wrong, to prove they are ignored.
const partnerOrder = (tag, party) => `INSERT INTO orders("customerName",product,quantity,value,status,items,"assignedTo","territoryId",${party[0]}) VALUES ('TEST B10 ${tag}','${NEEM}',2,1,'Pending','[{"name":"${NEEM}","quantity":2}]'::jsonb,'U-TEST-ADMIN',NULL,'${party[1]}')`;
const staffOrder = (tag, assignedTo, party) => `INSERT INTO orders("customerName",product,quantity,value,status,"assignedTo"${party ? `,${party[0]}` : ''}) VALUES ('TEST B10 ${tag}','${NEEM}',1,110,'Pending',${assignedTo === null ? 'NULL' : `'${assignedTo}'`}${party ? `,'${party[1]}'` : ''})`;
const ord = (tag) => `(SELECT coalesce("assignedTo",'<null>')||' / '||coalesce("territoryId",'<null>') FROM orders WHERE "customerName"='TEST B10 ${tag}')`;
const is = (tag, who, terr) => `${ord(tag)} = '${who} / ${terr}'`;
const D = (id) => ['"distributorId"', id], DL = (id) => ['"dealerId"', id], R = (id) => ['"retailerId"', id];
// "Can I see my own order afterwards?" -- division by zero (= refused) if the order is invisible to the user.
const seeOwn = (tag) => `; SELECT 1/count(*) FROM orders WHERE "customerName"='TEST B10 ${tag}'`;

const PARENT = 'O134'; // Pending, Admin-made, no partner, no invoice, no backorder
const backorder = (tag) => `INSERT INTO orders("customerName",product,quantity,value,status,"splitFromOrderId","deliveryAddress","deliveryPincode","assignedTo") VALUES ('TEST B10 ${tag}','${NEEM}',1,110,'Processing','${PARENT}','TEST address','395001','${EXEC1}')`;
const openBackorders = `(SELECT count(*) FROM orders WHERE "splitFromOrderId"='${PARENT}' AND status NOT IN ('Cancelled','Delivered'))`;

const dealer = (tag, parent, terr) => `INSERT INTO dealers(id,name,"parentDistributorId",state,city,"territoryId") VALUES ('DL-B10-${tag}','TEST B10 ${tag}','${parent}','Gujarat','Surat',${terr ? `'${terr}'` : 'NULL'})`;
const retailer = (tag, parent, terr) => `INSERT INTO retailers(id,name,"parentDealerId",state,city,"territoryId") VALUES ('RT-B10-${tag}','TEST B10 ${tag}','${parent}','Gujarat','Surat',${terr ? `'${terr}'` : 'NULL'})`;
const terrOf = (table, id) => `(SELECT coalesce("territoryId",'<null>') FROM ${table} WHERE id='${id}')`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Partner portal orders: owner and territory worked out in the DB ──
S(DI, 'O1 Distributor (D-TEST-1, territory link) -> Gujarat exec', partnerOrder('O1', D('D-TEST-1')), 'ok', { assert: is('O1', GUJ_EXEC, GUJ), show: ord('O1') });
S(DI2, 'O2 Distributor 2 (Pune, no link: by place) -> TEST Pune Zone / Sales Exec 1', partnerOrder('O2', D('D-TEST-2')), 'ok', { assert: is('O2', EXEC1, PUNE), show: ord('O2') });
S(DE2, 'O3 Dealer 2 (Mumbai, none) -> its distributor\'s zone / Sales Exec 1', partnerOrder('O3', DL('DL-TEST-2')), 'ok', { assert: is('O3', EXEC1, PUNE), show: ord('O3') });
S(RE2, 'O4 Retailer 2 (Mumbai) -> dealer -> distributor\'s zone / Sales Exec 1', partnerOrder('O4', R('R-TEST-2')), 'ok', { assert: is('O4', EXEC1, PUNE), show: ord('O4') });
S(DE, 'O5 Dealer (DL-TEST-1, link) -> Gujarat exec', partnerOrder('O5', DL('DL-TEST-1')), 'ok', { assert: is('O5', GUJ_EXEC, GUJ), show: ord('O5') });
S(RE, 'O6 Retailer (R-TEST-1, link) -> Gujarat exec', partnerOrder('O6', R('R-TEST-1')), 'ok', { assert: is('O6', GUJ_EXEC, GUJ), show: ord('O6') });
S(P2E, 'O7 P2E Distributor (Vadodara, no zone) -> unassigned, browser\'s owner ignored', partnerOrder('O7', D('DIST-1790706652956')), 'ok', { assert: is('O7', '<null>', '<null>'), show: ord('O7') });
S(DI2, 'O8 Distributor 2 when Sales Exec 1 is Inactive -> no owner, zone kept', partnerOrder('O8', D('D-TEST-2')), 'ok', {
  setup: `UPDATE users SET status='Inactive' WHERE id='${EXEC1}'`, assert: is('O8', '<null>', PUNE), show: ord('O8') });
S(DI, 'O9 Distributor still sees own order', partnerOrder('O9', D('D-TEST-1')) + seeOwn('O9'), 'ok');

// ── 2. Staff orders with no owner ──
S(SM, 'M1 Sales Manager, owner blank, no partner -> the manager; manager sees it', staffOrder('M1', '') + seeOwn('M1'), 'ok', { assert: is('M1', MGR, '<null>'), show: ord('M1') });
S(SM, 'M2 Sales Manager, owner NULL -> the manager', staffOrder('M2', null), 'ok', { assert: is('M2', MGR, '<null>'), show: ord('M2') });
S(SM, 'M3 Sales Manager assigns Sales Exec 1 -> kept', staffOrder('M3', EXEC1), 'ok', { assert: is('M3', EXEC1, '<null>'), show: ord('M3') });
S(SM, 'M4 Sales Manager for D-TEST-2, owner blank -> manager, zone filled', staffOrder('M4', '', D('D-TEST-2')), 'ok', { assert: is('M4', MGR, PUNE), show: ord('M4') });
S(SE1, 'M5 Sales Exec 1, owner blank -> Sales Exec 1 (was refused by RLS)', staffOrder('M5', ''), 'ok', { assert: is('M5', EXEC1, '<null>'), show: ord('M5') });
S(SE1, 'M6 Sales Exec 1 assigns Sales Exec 2 -> still refused (RLS)', staffOrder('M6', EXEC2), 'refused');
S(AD, 'A1 Admin for D-TEST-2, owner blank -> territory route', staffOrder('A1', '', D('D-TEST-2')), 'ok', { assert: is('A1', EXEC1, PUNE), show: ord('A1') });
S(AD, 'A2 Admin, owner blank, no partner -> stays blank', staffOrder('A2', ''), 'ok', { assert: is('A2', '<null>', '<null>'), show: ord('A2') });
S(AD, 'A3 Admin assigns Sales Exec 2 for D-TEST-2 -> kept, zone filled', staffOrder('A3', EXEC2, D('D-TEST-2')), 'ok', { assert: is('A3', EXEC2, PUNE), show: ord('A3') });

// ── 3. One open backorder per parent ──
S(AD, 'S1 Admin: one backorder of O134', backorder('S1'), 'ok', { assert: `${openBackorders}=1` });
S(AD, 'S2 Admin: second backorder of O134 (the double click)', `${backorder('S2a')}; ${backorder('S2b')}`, 'refused', { msg: 'already has an open backorder' });
S(AD, 'S3 Admin: index alone stops it (trigger switched off, as two simultaneous clicks)', `${backorder('S3a')}; ${backorder('S3b')}`, 'refused', {
  setup: `ALTER TABLE orders DISABLE TRIGGER order_one_open_backorder`, msg: 'orders_one_open_backorder' });
S(AD, 'S4 Admin: first backorder cancelled -> a new split allowed', `${backorder('S4a')}; UPDATE orders SET status='Cancelled' WHERE "customerName"='TEST B10 S4a'; ${backorder('S4b')}`, 'ok', { assert: `${openBackorders}=1` });

// ── 4. Dealers and retailers inherit their parent's territory ──
S(AD, 'T1 Admin: dealer under D-TEST-1, no territory -> D-TEST-1\'s', dealer('T1', 'D-TEST-1', null), 'ok', { assert: `${terrOf('dealers', 'DL-B10-T1')}='${GUJ}'` });
S(AD, 'T2 Admin: dealer under D-TEST-1 with TEST Pune Zone -> kept', dealer('T2', 'D-TEST-1', PUNE), 'ok', { assert: `${terrOf('dealers', 'DL-B10-T2')}='${PUNE}'` });
S(AD, 'T3 Admin: retailer under DL-TEST-1, no territory -> dealer\'s', retailer('T3', 'DL-TEST-1', null), 'ok', { assert: `${terrOf('retailers', 'RT-B10-T3')}='${GUJ}'` });
S(AD, 'T4 Admin: retailer under DL-TEST-2 (dealer has none) -> distributor\'s', retailer('T4', 'DL-TEST-2', null), 'ok', {
  setup: `UPDATE distributors SET "territoryId"='${PUNE}' WHERE id='D-TEST-2'`, assert: `${terrOf('retailers', 'RT-B10-T4')}='${PUNE}'` });
S(AD, 'T5 Admin: dealer under D-TEST-2 (none anywhere) -> stays empty', dealer('T5', 'D-TEST-2', null), 'ok', { assert: `${terrOf('dealers', 'DL-B10-T5')}='<null>'` });
S(AD, 'T6 Admin clears DL-TEST-2 territory after D-TEST-2 gets one -> inherits', `UPDATE dealers SET "territoryId"=NULL WHERE id='DL-TEST-2'`, 'ok', {
  setup: `UPDATE distributors SET "territoryId"='${PUNE}' WHERE id='D-TEST-2'`, assert: `${terrOf('dealers', 'DL-TEST-2')}='${PUNE}'` });

const mig = readFileSync('D:/PRISMORA/migrations/076_order_ownership_and_split_guard.sql', 'utf8')
  .replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');
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

const dir = `${tmpdir()}/prismora-b10`;
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun10.sql`;
writeFileSync(f, body);
let raw;
try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f "${f}" 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
unlinkSync(f);
const m = raw.match(/DRYRUN-REPORT([\s\S]*)/);
if (!m) { console.log('no report returned:\n' + raw.slice(0, 3000)); process.exit(1); }
const text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\nCONTEXT')[0];
let bad = 0, seen = 0;
const byId = Object.fromEntries(steps.map(s => [s.id, s]));
for (const line of text.split('\n')) {
  const mm = line.match(/^\s*(.+?) \[want ([^\]]+)\] => (.*)$/);
  if (!mm) continue;
  const st = byId[mm[1]]; seen++;
  const refused = mm[3].startsWith('REFUSED'), rows0 = /rows=0\b/.test(mm[3]);
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
