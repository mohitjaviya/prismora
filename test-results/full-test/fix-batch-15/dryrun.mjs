// Fix batch 15 (migration 080) proven as the real roles. Harness copied from fix-batch-9/dryrun.mjs:
// the migration is installed INSIDE a transaction, each scenario runs in its own sub-transaction as the
// user (e-mail AND auth id, checked), and the block ends in RAISE EXCEPTION, so nothing is kept.
// Usage: node dryrun.mjs [with|without]   ("without" = once 080 is live, or to see what fails before it)
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const WH = env.TEST_WAREHOUSE_EMAIL, AD = env.TEST_ADMIN_EMAIL, DS = env.TEST_DISPATCH_EMAIL, SE = env.TEST_SALES_EXEC_1_EMAIL,
  DI = env.TEST_DISTRIBUTOR_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL;

const B1 = 'INV-ITEM-1791003427562-7c81';        // TEST-P3-B1, TEST Unrated Balm, 4 units, Main Warehouse, exp 2028-03-31
const EXP = 'INV-ITEM-1790621555217';            // TEST-P2-EXP-26592, Lavender, 10 units, expired 2026-09-28
const L1 = 'INV-ITEM-1790662959249-517c';        // TEST-P2-GRN-L1, Lavender, 20 units, exp 2027-10-31
const BALM = 'TEST Unrated Balm 25g', V = 'V1791003129329';
const qty = (id) => `(SELECT quantity FROM inventory WHERE id='${id}')`;
const moves = (id, kind) => `(SELECT count(*) FROM stock_movements WHERE "inventoryId"='${id}' AND kind='${kind}')`;
const lastMove = (id) => `(SELECT kind||' '||quantity||' by '||coalesce("createdBy",'?')||' note='||coalesce(note,'') FROM stock_movements WHERE "inventoryId"='${id}' ORDER BY id DESC LIMIT 1)`;
const sec = `(SELECT json_agg(json_build_object('id',id,'q',quantity,'exp',"expiryDate"::date)) FROM inventory WHERE product='${BALM}' AND "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse')`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Expired batch stays expired (P4-F5) ──
S(WH, 'E1 Warehouse moves an expired batch expiry later', `UPDATE inventory SET "expiryDate"=now()+interval '365 days' WHERE id='${EXP}'`, 'refused', { msg: 'cannot be moved later' });
S(WH, 'E2 Warehouse clears an expired batch expiry', `UPDATE inventory SET "expiryDate"=NULL WHERE id='${EXP}'`, 'refused', { msg: 'cannot be moved later' });
S(AD, 'E3 Admin moves an expired batch expiry later', `UPDATE inventory SET "expiryDate"='2030-01-01' WHERE id='${EXP}'`, 'refused', { msg: 'cannot be moved later' });
S(WH, 'E4 Warehouse moves an expired batch to another past date (stays expired)', `UPDATE inventory SET "expiryDate"='2026-09-01' WHERE id='${EXP}'`, 'ok');
S(WH, 'E5 Warehouse shortens an unexpired batch (2027-10-31 -> 2027-06-30)', `UPDATE inventory SET "expiryDate"='2027-06-30' WHERE id='${L1}'`, 'ok');
S(WH, 'E6 Warehouse edits another field on an expired batch', `UPDATE inventory SET "reorderLevel"=7 WHERE id='${EXP}'`, 'ok');
// ── 3. Quantities move only in the database ──
S(WH, 'Q1 Warehouse sets a quantity directly', `UPDATE inventory SET quantity=100000 WHERE id='${B1}'`, 'refused', { msg: 'changes only through' });
S(AD, 'Q2 Admin sets a quantity directly', `UPDATE inventory SET quantity=0 WHERE id='${B1}'`, 'refused', { msg: 'changes only through' });
S(WH, 'Q3 Edit form save: same quantity, other fields changed', `UPDATE inventory SET quantity=4, "reorderLevel"=3, "unitCost"=12 WHERE id='${B1}'`, 'ok');
S(WH, 'Q4 Add Batch with an opening quantity', `INSERT INTO inventory(id,product,"batchNumber",quantity,warehouse,"unitCost",reserved,transit,damaged,"reorderLevel") VALUES ('INV-B15-NEW','${BALM}','TEST-B15-NEW',5,'Main Warehouse',10,0,0,0,0)`, 'ok',
  { assert: `${qty('INV-B15-NEW')}=5` });
// ── 2a. adjust_stock ──
S(WH, 'A1 Warehouse adjusts +3 with a reason', `SELECT adjust_stock('${B1}',3,'TEST B15 found in recount')`, 'ok',
  { assert: `${qty(B1)}=7 AND ${moves(B1, 'adjustment')}=1`, show: lastMove(B1) });
S(WH, 'A2 Warehouse adjusts -5 on 4 units (was clamped to 0 silently)', `SELECT adjust_stock('${B1}',-5,'TEST B15')`, 'refused', { msg: 'holds 4 units' });
S(WH, 'A3 Warehouse adjusts with no reason', `SELECT adjust_stock('${B1}',1,'  ')`, 'refused', { msg: 'reason' });
S(WH, 'A4 Warehouse adjusts by 0', `SELECT adjust_stock('${B1}',0,'TEST B15')`, 'refused', { msg: 'whole number' });
S(WH, 'A5 Warehouse adjusts by 1.5', `SELECT adjust_stock('${B1}',1.5,'TEST B15')`, 'refused', { msg: 'whole number' });
S(WH, 'A6 Warehouse adjusts a batch that does not exist', `SELECT adjust_stock('INV-NOPE',1,'TEST B15')`, 'refused', { msg: 'no longer exists' });
S(AD, 'A7 Admin adjusts -4 to zero', `SELECT adjust_stock('${B1}',-4,'TEST B15 damaged')`, 'ok', { assert: `${qty(B1)}=0`, show: lastMove(B1) });
S(DS, 'A8 Dispatch (Inventory view) adjusts', `SELECT adjust_stock('${B1}',1,'TEST B15')`, 'refused', { msg: 'full Inventory' });
S(SE, 'A9 Sales Exec adjusts', `SELECT adjust_stock('${B1}',1,'TEST B15')`, 'refused', { msg: 'full Inventory' });
S(DI, 'A10 Distributor adjusts', `SELECT adjust_stock('${B1}',1,'TEST B15')`, 'refused', { msg: 'full Inventory' });
S(WH, 'A11 Two adjusts in a row add up (no lost update)', `SELECT adjust_stock('${B1}',2,'TEST B15 a'); SELECT adjust_stock('${B1}',3,'TEST B15 b')`, 'ok',
  { assert: `${qty(B1)}=9 AND ${moves(B1, 'adjustment')}=2` });
// ── 2b. count_stock ──
S(WH, 'C1 Warehouse counts 2 (system 4)', `SELECT count_stock('${B1}',2,4)`, 'ok',
  { assert: `${qty(B1)}=2 AND ${moves(B1, 'cycle_count')}=1`, show: lastMove(B1) });
S(WH, 'C2 Count opened at 5, batch now holds 4', `SELECT count_stock('${B1}',2,5)`, 'refused', { msg: 'now holds 4 units' });
S(WH, 'C3 Count matches: nothing changes, no movement', `SELECT count_stock('${B1}',4,4)`, 'ok', { assert: `${qty(B1)}=4 AND ${moves(B1, 'cycle_count')}=0` });
S(WH, 'C4 Count -1', `SELECT count_stock('${B1}',-1,4)`, 'refused', { msg: 'whole number' });
S(WH, 'C5 Count from 0 up to 5', `SELECT adjust_stock('${B1}',-4,'TEST B15'); SELECT count_stock('${B1}',5,0)`, 'ok', { assert: `${qty(B1)}=5` });
S(DS, 'C6 Dispatch counts', `SELECT count_stock('${B1}',2,4)`, 'refused', { msg: 'full Inventory' });
// ── 2c. transfer_stock ──
S(WH, 'T1 Warehouse moves 2 of 4 to Secondary Warehouse (new batch there)', `SELECT transfer_stock('${B1}','Secondary Warehouse',2,'TEST B15')`, 'ok',
  { assert: `${qty(B1)}=2 AND ${moves(B1, 'transfer_out')}=1 AND (SELECT count(*) FROM stock_movements WHERE kind='transfer_in' AND quantity=2 AND note LIKE '%Secondary Warehouse%')>=1`, show: sec });
S(WH, 'T2 Two transfers to the same warehouse merge into one batch', `SELECT transfer_stock('${B1}','Secondary Warehouse',1,'TEST B15'); SELECT transfer_stock('${B1}','secondary warehouse',2,'TEST B15')`, 'ok',
  { assert: `${qty(B1)}=1 AND (SELECT count(*) FROM inventory WHERE "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse')=1 AND (SELECT quantity FROM inventory WHERE "batchNumber"='TEST-P3-B1' AND warehouse='Secondary Warehouse')=3`, show: sec });
S(WH, 'T3 Move 5 from a batch of 4', `SELECT transfer_stock('${B1}','Secondary Warehouse',5,'TEST B15')`, 'refused', { msg: 'Only 4' });
S(WH, 'T4 Move to the warehouse it is already in', `SELECT transfer_stock('${B1}','Main Warehouse',1,'TEST B15')`, 'refused', { msg: 'already in' });
S(WH, 'T5 Move to a warehouse that does not exist', `SELECT transfer_stock('${B1}','Nowhere',1,'TEST B15')`, 'refused', { msg: 'Choose a warehouse' });
S(WH, 'T6 Move 0', `SELECT transfer_stock('${B1}','Secondary Warehouse',0,'TEST B15')`, 'refused', { msg: 'whole number' });
S(DS, 'T7 Dispatch moves stock', `SELECT transfer_stock('${B1}','Secondary Warehouse',1,'TEST B15')`, 'refused', { msg: 'full Inventory' });
S(WH, 'T8 Expired batch moved to Cold Storage keeps its expiry (still unsellable)', `SELECT transfer_stock('${EXP}','Cold Storage',2,'TEST B15')`, 'ok',
  { assert: `${qty(EXP)}=8 AND (SELECT bool_and(NOT batch_is_sellable("expiryDate")) FROM inventory WHERE "batchNumber"='TEST-P2-EXP-26592' AND warehouse='Cold Storage')` });
// ── 4. Audit of option lists and warehouses ──
S(AD, 'M1 Admin adds a lead source: audited', `INSERT INTO masters(id,list,key,label) VALUES ('M-TEST-B15','lead_source','TEST B15 Source','TEST B15 Source')`, 'ok',
  { assert: `(SELECT count(*) FROM audit_log WHERE table_name='masters' AND at=now() AND actor_name IS NOT NULL)=1` });
S(AD, 'M2 Admin edits a warehouse: audited', `UPDATE warehouses SET manager=manager||' ' WHERE id='W3'`, 'ok',
  { assert: `(SELECT count(*) FROM audit_log WHERE table_name='warehouses' AND at=now() AND actor_name IS NOT NULL)=1` });
// ── Regression: the owner-rights stock paths still move stock under the guard ──
S(DS, 'R1 Dispatch delivers 5 Lavender (deduct_stock)', `UPDATE orders SET status='Delivered' WHERE "customerName"='TEST B15 R1'`, 'ok', {
  setup: `INSERT INTO orders("customerName",product,quantity,value,status,items,"distributorId","deliveryAddress","deliveryPincode") VALUES ('TEST B15 R1','Lavender Body Wash',5,500,'Shipped','[]'::jsonb,'D-TEST-1','TEST address','411001')`,
  assert: `(SELECT sum(m.quantity) FROM stock_movements m JOIN orders o ON o.id=m."orderId" WHERE o."customerName"='TEST B15 R1' AND m.kind='delivery')=5` });
S(WH, 'R2 Warehouse records a GRN (grn_adds_stock)', `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('GRN-B15','TEST-PO-1','TEST Herbal Raw Materials Co','[{"product":"TEST Neem Face Wash 100ml","quantity":3,"receivedQty":3,"orderedQty":200,"unitCost":70,"batchNumber":"TEST-B15-GRN"}]'::jsonb, now())`, 'ok',
  { assert: `(SELECT quantity FROM inventory WHERE "batchNumber"='TEST-B15-GRN')=3` });
S(PM, 'R3 Purchase Manager records a purchase return (record_purchase_return)', `SELECT record_purchase_return('${V}','Damaged goods','[{"product":"${BALM}","quantity":1,"unitCost":50}]'::jsonb,'TEST B15',now())`, 'ok',
  { assert: `(SELECT sum(quantity) FROM inventory WHERE id IN ('${B1}','INV-ITEM-1791003445167-bda0'))=9` });
S(AD, 'R4 Admin deletes an empty TEST batch (delete untouched)', `DELETE FROM inventory WHERE id='INV-B15-DEL'`, 'ok', {
  setup: `INSERT INTO inventory(id,product,"batchNumber",quantity,warehouse,"unitCost",reserved,transit,damaged,"reorderLevel") VALUES ('INV-B15-DEL','${BALM}','TEST-B15-DEL',0,'Main Warehouse',0,0,0,0,0)` });

const mig = readFileSync('D:/PRISMORA/migrations/080_stock_moves_in_database.sql', 'utf8');
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
const f = `${dir}/dryrun15.sql`;
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
for (const line of text.split('\n')) {
  const mm = line.match(/^\s*(.+?) \[want ([^\]]+)\] => (.*)$/);
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
