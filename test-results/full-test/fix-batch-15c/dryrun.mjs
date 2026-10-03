// Migration 082 (deleting a GRN takes its stock back out) proven as the real roles. Harness copied from
// fix-batch-15b/dryrun.mjs: migration installed INSIDE a transaction, each scenario its own sub-transaction as the
// user (e-mail AND auth id, checked), everything rolled back. Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const WH = env.TEST_WAREHOUSE_EMAIL, AD = env.TEST_ADMIN_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL;

const N2 = 'INV-ITEM-1790662959240-52d9';        // TEST-P2-GRN-N2-96897, TEST Neem, 25 units
const NEEM = 'TEST Neem Face Wash 100ml';
const grn = (id, lines) => `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('${id}','TEST-PO-1','TEST Herbal Raw Materials Co','${JSON.stringify(lines)}'::jsonb, now())`;
const line = (batch, n) => ({ product: NEEM, quantity: n, receivedQty: n, orderedQty: 200, unitCost: 70, batchNumber: batch });
const del = (id) => `DELETE FROM grn WHERE id='${id}'`;
const batchQty = (batch) => `(SELECT coalesce(sum(quantity),0) FROM inventory WHERE "batchNumber"='${batch}')`;
const po = `(SELECT status FROM purchase_orders WHERE id='TEST-PO-1')`;
const vendor = `(SELECT "outstandingAmount" FROM vendors WHERE id='TEST-V-1')`;
const gone = (id) => `NOT EXISTS (SELECT 1 FROM grn WHERE id='${id}')`;
const reversed = (id) => `(SELECT coalesce(sum(quantity),0) FROM stock_movements WHERE "grnId"='${id}' AND kind='grn_reversed')`;
const state = (id) => `'PO '||${po}||', vendor '||${vendor}||', reversed '||${reversed(id)}`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

S(PM, 'D1 PM receives 3 into a new batch, then deletes the GRN', `${grn('GRN-C1', [line('TEST-C1', 3)])}; ${del('GRN-C1')}`, 'ok', {
  assert: `${gone('GRN-C1')} AND ${batchQty('TEST-C1')}=0 AND ${reversed('GRN-C1')}=3 AND ${po}='Confirmed' AND ${vendor}=4839`, show: state('GRN-C1') });
S(PM, 'D2 PM receives 2 into existing batch N2 (25), then deletes', `${grn('GRN-C2', [line('TEST-P2-GRN-N2-96897', 2)])}; ${del('GRN-C2')}`, 'ok', {
  assert: `(SELECT quantity FROM inventory WHERE id='${N2}')=25 AND ${reversed('GRN-C2')}=2 AND ${po}='Confirmed'`, show: state('GRN-C2') });
S(AD, 'D3 Admin deletes a two-line GRN: both lines reversed', `${grn('GRN-C3', [line('TEST-C3a', 1), line('TEST-C3b', 4)])}; ${del('GRN-C3')}`, 'ok', {
  assert: `${batchQty('TEST-C3a')}=0 AND ${batchQty('TEST-C3b')}=0 AND ${reversed('GRN-C3')}=5 AND ${vendor}=4839` });
S(PM, 'D4 Units since used (batch 3 -> 1): delete refused, nothing changes', del('GRN-C4'), 'refused', {
  setup: `${grn('GRN-C4', [line('TEST-C4', 3)])}; UPDATE inventory SET quantity=1 WHERE "batchNumber"='TEST-C4'`, msg: 'now holds only 1' });
S(PM, 'D5 GRN from before 081 (GRN-21, TEST-P3): delete refused', del('GRN-21'), 'refused', { msg: 'before receipts were tied' });
S(PM, 'D6 PO back from GRN Done to Partially Received when one of two GRNs goes',
  `${grn('GRN-C6a', [line('TEST-C6a', 150)])}; ${grn('GRN-C6b', [line('TEST-C6b', 50)])}; ${del('GRN-C6b')}`, 'ok', {
  assert: `${po}='Partially Received' AND ${batchQty('TEST-C6a')}=150 AND ${batchQty('TEST-C6b')}=0`, show: state('GRN-C6b') });
S(PM, 'D7 Receive again after deleting: the PO takes receipts again', `${grn('GRN-C7a', [line('TEST-C7', 200)])}; ${del('GRN-C7a')}; ${grn('GRN-C7b', [line('TEST-C7', 5)])}`, 'ok', {
  assert: `${po}='Partially Received' AND ${batchQty('TEST-C7')}=5` });
S(WH, 'D8 Warehouse (insert only) tries to delete a GRN: nothing removed', del('GRN-C8'), 'ok', {
  setup: grn('GRN-C8', [line('TEST-C8', 2)]), allow0: true, assert: `NOT ${gone('GRN-C8')} AND ${batchQty('TEST-C8')}=2` });
S(PM, 'D9 A closed PO keeps its status', `${del('GRN-C9')}`, 'ok', {
  setup: `${grn('GRN-C9', [line('TEST-C9', 2)])}; UPDATE purchase_orders SET status='Closed' WHERE id='TEST-PO-1'`,
  assert: `${po}='Closed' AND ${batchQty('TEST-C9')}=0` });

const mig = readFileSync('D:/PRISMORA/migrations/082_grn_delete_reverses_stock.sql', 'utf8');
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
const f = `${dir}/dryrun15c.sql`;
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
