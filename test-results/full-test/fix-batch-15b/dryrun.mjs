// Batch 15 gaps (migration 081) proven as the real roles. Harness copied from fix-batch-15/dryrun.mjs:
// migration installed INSIDE a transaction, each scenario its own sub-transaction as the user (e-mail AND auth id,
// checked), the whole block ends in RAISE EXCEPTION, so nothing is kept. Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const WH = env.TEST_WAREHOUSE_EMAIL, AD = env.TEST_ADMIN_EMAIL, DS = env.TEST_DISPATCH_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL;

const B1 = 'INV-ITEM-1791003427562-7c81';        // TEST-P3-B1, TEST Unrated Balm, 4 units, Main Warehouse
const EXP = 'INV-ITEM-1790621555217';            // expired Lavender batch
const N2 = 'INV-ITEM-1790662959240-52d9';        // TEST-P2-GRN-N2-96897, TEST Neem, 25 units
const BALM = 'TEST Unrated Balm 25g', NEEM = 'TEST Neem Face Wash 100ml';
const qty = (id) => `(SELECT quantity FROM inventory WHERE id='${id}')`;
const wh = (id) => `(SELECT warehouse FROM inventory WHERE id='${id}')`;
const grn = (id, lines) => `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('${id}','TEST-PO-1','TEST Herbal Raw Materials Co','${JSON.stringify(lines)}'::jsonb, now())`;
const line = (batch, n) => ({ product: NEEM, quantity: n, receivedQty: n, orderedQty: 200, unitCost: 70, batchNumber: batch });
const grnMoves = (id) => `(SELECT json_agg(kind||' '||quantity||' '||"inventoryId"||' by '||coalesce("createdBy",'?')||' / '||coalesce(note,'')) FROM stock_movements WHERE "grnId"='${id}')`;
const EMPTY = `INSERT INTO inventory(id,product,"batchNumber",quantity,warehouse,"unitCost",reserved,transit,damaged,"reorderLevel") VALUES ('INV-B15B-EMPTY','${BALM}','TEST-B15B-EMPTY',0,'Main Warehouse',0,0,0,0,0)`;
const DST = `INSERT INTO inventory(id,product,"batchNumber",quantity,warehouse,"unitCost",reserved,transit,damaged,"reorderLevel") VALUES ('INV-B15B-DST','${BALM}','TEST-P3-B1',1,'Secondary Warehouse',0,0,0,0,0)`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Warehouse change of a batch = a recorded transfer ──
S(WH, 'W1 Warehouse changes the warehouse of a batch holding 4 units directly', `UPDATE inventory SET warehouse='Secondary Warehouse' WHERE id='${B1}'`, 'refused', { msg: 'changes warehouse only through Transfer' });
S(AD, 'W2 Admin does the same', `UPDATE inventory SET warehouse='Cold Storage' WHERE id='${B1}'`, 'refused', { msg: 'changes warehouse only through Transfer' });
S(WH, 'W3 An empty batch can still be relabelled', `UPDATE inventory SET warehouse='Cold Storage' WHERE id='INV-B15B-EMPTY'`, 'ok', {
  setup: EMPTY, assert: `${wh('INV-B15B-EMPTY')}='Cold Storage'` });
S(WH, 'W4 Whole batch (4) to Secondary, nothing to merge into: the batch itself moves', `SELECT transfer_stock('${B1}','Secondary Warehouse',4,'TEST B15b edit form')`, 'ok', {
  assert: `${wh(B1)}='Secondary Warehouse' AND ${qty(B1)}=4 AND (SELECT count(*) FROM inventory WHERE "batchNumber"='TEST-P3-B1')=1 AND (SELECT count(*) FROM stock_movements WHERE "inventoryId"='${B1}' AND kind IN ('transfer_out','transfer_in') AND quantity=4 AND note LIKE '%TEST B15b%')=2` });
S(WH, 'W5 Whole batch where the destination already has that batch: merged, source at 0', `SELECT transfer_stock('${B1}','Secondary Warehouse',4,'TEST B15b')`, 'ok', {
  setup: DST, assert: `${qty(B1)}=0 AND ${wh(B1)}='Main Warehouse' AND ${qty('INV-B15B-DST')}=5` });
S(WH, 'W6 Part of a batch still splits into a new batch (unchanged)', `SELECT transfer_stock('${B1}','Secondary Warehouse',2,'TEST B15b')`, 'ok', {
  assert: `${qty(B1)}=2 AND ${wh(B1)}='Main Warehouse' AND (SELECT quantity FROM inventory WHERE "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse')=2` });
S(WH, 'W7 Edit form save that keeps the warehouse', `UPDATE inventory SET warehouse='Main Warehouse', "reorderLevel"=6 WHERE id='${B1}'`, 'ok');
S(DS, 'W8 Dispatch moves the whole batch', `SELECT transfer_stock('${B1}','Secondary Warehouse',4,'TEST B15b')`, 'refused', { msg: 'full Inventory' });
// ── 2. GRNs write a movement row ──
S(WH, 'G1 Warehouse GRN of 3 into a new batch', grn('GRN-B15B-1', [line('TEST-B15B-G1', 3)]), 'ok', {
  assert: `(SELECT count(*) FROM stock_movements m JOIN inventory i ON i.id=m."inventoryId" WHERE m."grnId"='GRN-B15B-1' AND m.kind='grn' AND m.quantity=3 AND i."batchNumber"='TEST-B15B-G1' AND m."createdBy"='U-TEST-WAREHOUSE' AND m.note LIKE '%TEST-PO-1%')=1`,
  show: grnMoves('GRN-B15B-1') });
S(PM, 'G2 Purchase Manager GRN of 2 into existing batch N2 (25)', grn('GRN-B15B-2', [line('TEST-P2-GRN-N2-96897', 2)]), 'ok', {
  assert: `${qty(N2)}=27 AND (SELECT count(*) FROM stock_movements WHERE "grnId"='GRN-B15B-2' AND kind='grn' AND "inventoryId"='${N2}' AND quantity=2 AND "createdBy"='U-TEST-PURCHASE-MANAGER')=1`,
  show: grnMoves('GRN-B15B-2') });
S(WH, 'G3 GRN with two lines: two movement rows', grn('GRN-B15B-3', [line('TEST-B15B-G3a', 1), line('TEST-B15B-G3b', 2)]), 'ok', {
  assert: `(SELECT count(*) FROM stock_movements WHERE "grnId"='GRN-B15B-3' AND kind='grn')=2 AND (SELECT sum(quantity) FROM stock_movements WHERE "grnId"='GRN-B15B-3')=3` });
S(WH, 'G4 GRN line with 0 received: no stock, no movement', grn('GRN-B15B-4', [line('TEST-B15B-G4', 0), line('TEST-B15B-G4b', 1)]), 'ok', {
  assert: `(SELECT count(*) FROM stock_movements WHERE "grnId"='GRN-B15B-4')=1` });
// ── Batch 15 rules unchanged ──
S(WH, 'R1 Expired batch expiry moved later: still refused', `UPDATE inventory SET "expiryDate"='2030-01-01' WHERE id='${EXP}'`, 'refused', { msg: 'cannot be moved later' });
S(WH, 'R2 Direct quantity change: still refused', `UPDATE inventory SET quantity=99 WHERE id='${B1}'`, 'refused', { msg: 'changes only through' });
S(WH, 'R3 Adjust still works', `SELECT adjust_stock('${B1}',1,'TEST B15b')`, 'ok', { assert: `${qty(B1)}=5` });

const mig = readFileSync('D:/PRISMORA/migrations/081_batch_move_and_grn_movements.sql', 'utf8');
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
const f = `${dir}/dryrun15b.sql`;
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
  const refused = mm[3].startsWith('REFUSED'), rows0 = /rows=0\b/.test(mm[3]) && !/^\s*SELECT/.test(st.stmt);
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
