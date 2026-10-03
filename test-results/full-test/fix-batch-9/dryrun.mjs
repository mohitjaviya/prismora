// Fix batch 9 (migration 075) proven as the real roles. The migration is installed INSIDE a
// transaction, each scenario runs in its own sub-transaction, and the block ends in RAISE EXCEPTION,
// so nothing is kept. Usage: node dryrun.mjs [with|without]   ("without" = re-check once 075 is live)
// Template for later dry runs: each step signs in with the user's e-mail AND auth id (sub), and a
// step whose identity did not take is a FAIL, never a "refused".
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const PM = env.TEST_PURCHASE_MANAGER_EMAIL, AC = env.TEST_ACCOUNTS_EMAIL, AD = env.TEST_ADMIN_EMAIL, SA = env.TEST_SUPER_ADMIN_EMAIL,
  WH = env.TEST_WAREHOUSE_EMAIL, DI = env.TEST_DISTRIBUTOR_EMAIL;

const V = 'V1791003129329', BALM = 'TEST Unrated Balm 25g', B1 = 'INV-ITEM-1791003427562-7c81', B2 = 'INV-ITEM-1791003445167-bda0';
const rec = (qty, cost, product = BALM, vendor = V) =>
  `SELECT record_purchase_return('${vendor}','Damaged goods','[{"product":"${product}","quantity":${JSON.stringify(qty)},"unitCost":${cost}}]'::jsonb,'TEST batch 9 dry run',now())`;
const lastPR = `(SELECT id FROM purchase_returns WHERE notes='TEST batch 9 dry run' ORDER BY "createdAt" DESC LIMIT 1)`;
const owed = `(SELECT "outstandingAmount" FROM vendors WHERE id='${V}')`;
const b1b2 = `(SELECT sum(quantity) FROM inventory WHERE id IN ('${B1}','${B2}'))`;
const DT2_UNPAID = 'INV-1790621973293', DT1_PAID = 'INV-1790599464550', WALKIN_TAX = 'INV-1790687111466',
  PF_PAY = 'INV-1790666261292', PF_CN = 'INV-1790601558422', PF_FREE = 'INV-1790687900007';
const cn = (id, inv, amount, party) => `INSERT INTO credit_notes(id,"invoiceId","customerName",amount,reason,"distributorId") VALUES ('${id}',${inv ? `'${inv}'` : 'NULL'},'TEST batch 9',${amount},'Other',${party ? `'${party}'` : 'NULL'})`;
const status = (inv) => `(SELECT status||' paid='||"amountPaid" FROM invoices WHERE id='${inv}')`;

const steps = [];
// expect: 'ok' | 'refused'; msg: text SQLERRM must contain; assert: SQL boolean checked after (as maintenance); show: SQL text shown
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Purchase returns ──
S(PM, 'P1 PM returns 3 of 10 received @₹50', rec(3, 50), 'ok', {
  assert: `${b1b2}=7 AND ${owed}=250 AND (SELECT sum(quantity) FROM stock_movements WHERE "returnId"=${lastPR} AND kind='purchase_return')=3`,
  show: `'B1+B2 10->'||${b1b2}||'; owed 400->'||${owed}` });
S(PM, 'P2 PM returns 11 (vendor delivered 10)', rec(11, 50), 'refused', { msg: 'more than' });
S(PM, 'P3 PM returns 100000 (the Phase 3 case)', rec(100000, 50), 'refused', { msg: 'more than' });
S(PM, 'P4 PM returns 2 at ₹51 (vendor charged ₹50)', rec(2, 51), 'refused', { msg: 'above the most' });
S(PM, 'P5 PM returns 0', rec(0, 50), 'refused', { msg: 'whole number' });
S(PM, 'P6 PM returns -5', rec(-5, 50), 'refused', { msg: 'whole number' });
S(PM, 'P7 PM returns 2.5', rec(2.5, 50), 'refused', { msg: 'whole number' });
S(PM, 'P8 PM returns all 10: taken from the vendor batches B1 (4) + B2 (6), not TEST-B3', rec(10, 50), 'ok', {
  assert: `${b1b2}=0 AND (SELECT quantity FROM inventory WHERE id='TEST-INV-3')=45 AND jsonb_array_length((SELECT items FROM purchase_returns WHERE id=${lastPR}))=2 AND ${owed}=-100`,
  show: `'B1+B2 ->'||${b1b2}||'; owed ->'||${owed}` });
S(PM, 'P9 PM returns 6 then 6 more (12 > 10 received)', `${rec(6, 50)}; ${rec(6, 50)}`, 'refused', { msg: 'already returned 6' });
S(PM, 'P10 PM returns a product this vendor never delivered', rec(1, 1, 'TEST Neem Face Wash 100ml'), 'refused', { msg: 'never delivered' });
S(PM, 'P11 PM returns 5 when only 1 unit of the product is held', rec(5, 50), 'refused', {
  setup: `UPDATE inventory SET quantity = CASE id WHEN '${B1}' THEN 1 ELSE 0 END WHERE product='${BALM}'`, msg: 'Only 1' });
S(PM, 'P12 PM records 3 then withdraws: exactly 3 go back, owed back to 400', `${rec(3, 50)}; SELECT withdraw_purchase_return(${lastPR})`, 'ok', {
  assert: `${b1b2}=10 AND ${owed}=400 AND NOT EXISTS (SELECT 1 FROM purchase_returns WHERE notes='TEST batch 9 dry run') AND (SELECT count(*) FROM stock_movements WHERE kind='purchase_return_withdrawn' AND quantity>0)>=1`,
  show: `'B1+B2 ->'||${b1b2}||'; owed ->'||${owed}` });
S(PM, 'P13 PM withdraws a return twice', `${rec(3, 50)}; CREATE TEMP TABLE t9 AS SELECT ${lastPR} id; SELECT withdraw_purchase_return((SELECT id FROM t9)); SELECT withdraw_purchase_return((SELECT id FROM t9))`, 'refused', { msg: 'no longer exists' });
S(PM, 'P14 PM withdraws legacy TEST-RET-1 (no stock trail)', `SELECT withdraw_purchase_return('TEST-RET-1')`, 'refused', { msg: 'before stock moves' });
S(PM, 'P15 PM withdraws legacy TEST-RET-PM (no items): allowed, no stock change', `SELECT withdraw_purchase_return('TEST-RET-PM')`, 'ok', {
  assert: `NOT EXISTS (SELECT 1 FROM purchase_returns WHERE id='TEST-RET-PM')` });
S(PM, 'P16 PM inserts purchase_returns directly', `INSERT INTO purchase_returns(id,"vendorId","vendorName",items,value) VALUES ('PR-DRY9','${V}','x','[]',5000000)`, 'refused', { msg: 'only from Purchases' });
S(PM, 'P17 PM deletes a return directly (old Withdraw path)', `DELETE FROM purchase_returns WHERE id='TEST-RET-1'`, 'refused', { msg: 'only from Purchases' });
S(PM, 'P18 PM edits a return value directly', `UPDATE purchase_returns SET value=1 WHERE id='TEST-RET-1'`, 'refused', { msg: 'only from Purchases' });
S(WH, 'P19 Warehouse records a purchase return', rec(1, 50), 'refused', { msg: 'Purchases access' });
S(DI, 'P20 Distributor records a purchase return', rec(1, 50), 'refused');
S(AD, 'P21 Admin records 1 @₹50', rec(1, 50), 'ok', { assert: `${owed}=350` });

// ── 2. Credit notes ──
S(AC, 'C1 Accounts CN ₹985 on unpaid ₹985 invoice (D-TEST-2)', cn('CN-DRY9-1', DT2_UNPAID, 985, 'D-TEST-2'), 'ok', {
  assert: `${status(DT2_UNPAID)} LIKE 'Settled%'`, show: status(DT2_UNPAID) });
S(AC, 'C2 Accounts CN ₹986 on the same invoice', cn('CN-DRY9-2', DT2_UNPAID, 986, 'D-TEST-2'), 'refused', { msg: 'at most ₹985' });
S(AC, 'C3 Accounts CN ₹5,000 on settled ₹1,180 invoice (the Phase 3 case)', cn('CN-DRY9-3', DT1_PAID, 5000, 'D-TEST-1'), 'refused', { msg: 'at most ₹0' });
S(AC, 'C4 Accounts CN ₹1 on that settled invoice', cn('CN-DRY9-4', DT1_PAID, 1, 'D-TEST-1'), 'refused', { msg: 'still due' });
S(AC, 'C5 Accounts CN ₹500 then ₹486 on the ₹985 invoice', `${cn('CN-DRY9-5', DT2_UNPAID, 500, 'D-TEST-2')}; ${cn('CN-DRY9-6', DT2_UNPAID, 486, 'D-TEST-2')}`, 'refused', { msg: 'at most ₹485' });
S(AC, 'C6 Accounts CN on D-TEST-2 invoice credited to D-TEST-1', cn('CN-DRY9-7', DT2_UNPAID, 10, 'D-TEST-1'), 'refused', { msg: 'partner the invoice is for' });
S(AC, 'C7 Accounts unlinked CN = D-TEST-2 balance owed', `${cn('CN-DRY9-8', null, 0, 'D-TEST-2').replace(',0,', ",(SELECT \"outstandingAmount\" FROM distributors WHERE id='D-TEST-2'),")}`, 'ok');
S(AC, 'C8 Accounts unlinked CN = D-TEST-2 balance + ₹1', `${cn('CN-DRY9-9', null, 0, 'D-TEST-2').replace(',0,', ",(SELECT \"outstandingAmount\"+1 FROM distributors WHERE id='D-TEST-2'),")}`, 'refused', { msg: 'not tied to an invoice' });
S(AC, 'C9 Accounts unlinked CN ₹1 to D-TEST-1 (already in credit)', cn('CN-DRY9-10', null, 1, 'D-TEST-1'), 'refused', { msg: 'owes ₹0' });
S(AC, 'C10 Accounts CN with no invoice and no partner', cn('CN-DRY9-11', null, 10, null), 'refused', { msg: 'needs an invoice or a partner' });
S(AC, 'C11 Accounts raises the amount of an issued CN', `UPDATE credit_notes SET amount=amount+1000 WHERE id='CN-SR-1791002137418'`, 'refused', { msg: 'fixed once issued' });
S(AC, 'C12 Accounts edits the reason of an issued CN', `UPDATE credit_notes SET reason=reason||' (dry)' WHERE id='CN-SR-1791002137418'`, 'ok');
S(AC, 'C13 Accounts CN ₹130 on unpaid walk-in tax invoice', cn('CN-DRY9-12', WALKIN_TAX, 130, null), 'ok', { assert: `${status(WALKIN_TAX)} LIKE 'Settled%'` });
S(AC, 'C14 Accounts sales return of 1 on O79 (proforma already Settled): its CN is allowed', `SELECT record_sales_return('O79','[{"product":"TEST Neem Face Wash 100ml","quantity":1,"inventoryId":"TEST-INV-1"}]'::jsonb,'TEST batch 9 dry run')`, 'ok', {
  assert: `EXISTS (SELECT 1 FROM credit_notes WHERE id LIKE 'CN-SR-%' AND "invoiceId"='INV-1790592938058')`,
  show: `(SELECT 'CN '||amount FROM credit_notes WHERE "invoiceId"='INV-1790592938058' ORDER BY "createdAt" DESC LIMIT 1)` });
S(AC, 'C15 Accounts fakes a sales-return CN id (CN-SR-…) for ₹5,000', cn('CN-SR-DRY9', DT1_PAID, 5000, 'D-TEST-1'), 'refused', { msg: 'still due' });
S(AC, 'C16 Accounts CN of -500', cn('CN-DRY9-13', null, -500, 'D-TEST-2'), 'refused', { msg: 'credit_notes_amount_positive' });

// ── 3. Issued tax invoices ──
S(AC, 'I1 Accounts deletes a settled tax invoice (has payment)', `DELETE FROM invoices WHERE id='${DT1_PAID}'`, 'refused', { msg: 'cannot be deleted' });
S(AD, 'I2 Admin deletes an unpaid tax invoice (no money attached)', `DELETE FROM invoices WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'cannot be deleted' });
S(SA, 'I3 Super Admin deletes a tax invoice', `DELETE FROM invoices WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'cannot be deleted' });
S(AC, 'I4 Accounts edits a tax invoice amount', `UPDATE invoices SET amount=1 WHERE id='${DT1_PAID}'`, 'refused', { msg: 'can no longer be changed' });
S(AD, 'I5 Admin edits a tax invoice tax', `UPDATE invoices SET tax=0 WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'can no longer be changed' });
S(AD, 'I6 Admin sets an unpaid tax invoice to Settled', `UPDATE invoices SET status='Settled' WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'can no longer be changed' });
S(SA, 'I7 Super Admin renames the customer', `UPDATE invoices SET "customerName"='X' WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'can no longer be changed' });
S(AC, 'I8 Accounts edits the lines', `UPDATE invoices SET lines='[]' WHERE id='${DT2_UNPAID}'`, 'refused', { msg: 'can no longer be changed' });
S(AC, 'I9 Accounts marks a walk-in tax invoice paid', `UPDATE invoices SET "markedPaid"=true WHERE id='${WALKIN_TAX}'`, 'ok', { assert: `${status(WALKIN_TAX)} LIKE 'Settled%'`, show: status(WALKIN_TAX) });
S(AC, 'I10 Accounts records the payment of a partner tax invoice', `INSERT INTO distributor_payments(id,"distributorId",amount,"createdAt") VALUES ('PAY-INV-${DT2_UNPAID}','D-TEST-2',985,now())`, 'ok', {
  assert: `${status(DT2_UNPAID)} LIKE 'Settled%'`, show: status(DT2_UNPAID) });
S(AC, 'I11 Accounts reassigns a tax invoice', `UPDATE invoices SET "assignedTo"="assignedTo" WHERE id='${DT2_UNPAID}'`, 'ok');
S(AC, 'I12 Accounts deletes a proforma with a payment', `DELETE FROM invoices WHERE id='${PF_PAY}'`, 'refused', { msg: 'payment or credit note' });
S(AC, 'I13 Accounts deletes a proforma with a credit note', `DELETE FROM invoices WHERE id='${PF_CN}'`, 'refused', { msg: 'payment or credit note' });
S(AC, 'I14 Accounts deletes a proforma with no money against it', `DELETE FROM invoices WHERE id='${PF_FREE}'`, 'ok');
S(AC, 'I15 Accounts flips a proforma to tax_invoice directly', `UPDATE invoices SET "invoiceType"='tax_invoice' WHERE id='${PF_FREE}'`, 'refused', { msg: 'only through Convert' });
S(AC, 'I16 Accounts converts a proforma with Convert', `SELECT convert_to_tax_invoice('${PF_FREE}')`, 'ok', { show: `(SELECT "invoiceType"||' tax='||tax FROM invoices WHERE id='${PF_FREE}')` });

// ── 4. Value rules ──
S(AC, 'K1 Accounts expense -500', `INSERT INTO expenses(id,category,amount,description,date) VALUES ('EXP-DRY9-1','Other',-500,'TEST dry','2026-10-03')`, 'refused', { msg: 'expenses_amount_positive' });
S(AC, 'K2 Accounts expense 0', `INSERT INTO expenses(id,category,amount,description,date) VALUES ('EXP-DRY9-2','Other',0,'TEST dry','2026-10-03')`, 'refused', { msg: 'expenses_amount_positive' });
S(AC, 'K3 Accounts expense ₹5', `INSERT INTO expenses(id,category,amount,description,date) VALUES ('EXP-DRY9-3','Other',5,'TEST dry','2026-10-03')`, 'ok');
S(AC, 'K4 Accounts partner payment -5', `INSERT INTO distributor_payments(id,"distributorId",amount,"createdAt") VALUES ('PAY-DRY9-1','D-TEST-2',-5,now())`, 'refused', { msg: 'distributor_payments_amount_positive' });
S(PM, 'K5 PM vendor payment -5', `INSERT INTO vendor_payments(id,"vendorId",amount) VALUES ('VPAY-DRY9-1','${V}',-5)`, 'refused', { msg: 'vendor_payments_amount_positive' });
S(PM, 'K6 PM vendor payment 0', `INSERT INTO vendor_payments(id,"vendorId",amount) VALUES ('VPAY-DRY9-2','${V}',0)`, 'refused', { msg: 'vendor_payments_amount_positive' });
S(AD, 'K7 Admin product MRP -1', `UPDATE products SET mrp=-1 WHERE name='${BALM}'`, 'refused', { msg: 'products_prices_not_negative' });
S(AD, 'K8 Admin dealer price -1', `UPDATE products SET "dealerPrice"=-1 WHERE name='${BALM}'`, 'refused', { msg: 'products_prices_not_negative' });
S(AD, 'K9 Admin GST -5', `UPDATE products SET "gstPct"=-5 WHERE name='${BALM}'`, 'refused', { msg: 'products_prices_not_negative' });
S(SA, 'K10 Super Admin MRP +1 (allowed)', `UPDATE products SET mrp=coalesce(mrp,0)+1 WHERE name='${BALM}'`, 'ok');

const mig = readFileSync('D:/PRISMORA/migrations/075_money_and_stock_integrity.sql', 'utf8')
  .replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');
const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; a text; s text; c text; BEGIN\n`;
if (mode === 'with') body += `  EXECUTE $mig$${mig}$mig$;\n`;
for (const st of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    ${st.setup ? `EXECUTE '${q(st.setup)}';` : ''}
    -- The full identity a real sign-in carries: the e-mail AND the user id
    -- (sub). Guards keyed on auth.uid() (B10 order lock, 061/063) see NULL
    -- without sub and wave everything through as "maintenance".
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

const dir = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/8f391113-5da9-47a3-91d8-276d5282ed17/scratchpad';
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun9.sql`;
writeFileSync(f, body);
let raw;
try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${f} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
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
  const refused = mm[3].startsWith('REFUSED'), rows0 = /rows=0\b/.test(mm[3]) && !/^SELECT/.test(st.stmt.trim()) && !st.stmt.includes('SELECT record') && !st.stmt.includes('SELECT withdraw');
  let ok = mm[2] === 'refused' ? refused : (!refused && !rows0);
  // A step that never ran as the user proves nothing, whatever it expected.
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
