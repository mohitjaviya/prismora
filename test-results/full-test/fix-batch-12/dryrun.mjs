// Fix batch 12 (migration 078) proven as the real roles. Harness copied from fix-batch-11/dryrun.mjs:
// migration installed INSIDE a transaction, each scenario its own sub-transaction, full identity
// (e-mail AND auth id) per step, and the whole block ends in RAISE EXCEPTION so nothing is kept.
// Usage: node dryrun.mjs [with|without]   ("without" = re-check once 078 is live, or show the old gaps)
// want 'none' = RLS hides the row: refused OR 0 rows both count, and the assert must show the row still there.
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const E = (k) => env[`TEST_${k}_EMAIL`];
const SA = E('SUPER_ADMIN'), AD = E('ADMIN'), SE1 = E('SALES_EXEC_1'), SALES = E('SALES'),
  ACC = E('ACCOUNTS'), DSP = E('DISPATCH'), WH = E('WAREHOUSE'), PM = E('PURCHASE_MANAGER'), CS = E('CUSTOMER_SUPPORT'),
  DI = E('DISTRIBUTOR'), DE = E('DEALER'), SM = E('SALES_MANAGER');
const EXEC1 = 'U-TEST-SALES-EXEC-1';

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Dispatch does not delete orders ──
const ORD = 'O146';
const ordLeft = `(SELECT count(*) FROM orders WHERE id='${ORD}')`;
S(DSP, 'O1 Dispatch deletes a Pending order -> kept', `DELETE FROM orders WHERE id='${ORD}'`, 'none', { assert: `${ordLeft}=1` });
S(AD, 'O2 Admin deletes a Pending order (control)', `DELETE FROM orders WHERE id='${ORD}'`, 'ok', { assert: `${ordLeft}=0` });
S(WH, 'O3 Warehouse deletes a Pending order (control, unchanged)', `DELETE FROM orders WHERE id='${ORD}'`, 'ok', { assert: `${ordLeft}=0` });
S(DSP, 'O4 Dispatch moves an order on (control: update kept)', `UPDATE orders SET status=status WHERE id='${ORD}'`, 'ok');

// ── 2. Warehouse records GRNs ──
const GRN = (id) => `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate","receivedBy") VALUES ('${id}','TEST-PO-1','TEST Herbal Raw Materials Co','[{"product":"TEST Neem Face Wash 100ml","quantity":5,"receivedQty":5,"orderedQty":200,"unitCost":70,"batchNumber":"TEST-B12-GRN","expiryDate":null}]'::jsonb, now(), 'U-TEST-WAREHOUSE')`;
const grnEffects = `(SELECT (SELECT coalesce(sum(quantity),0) FROM inventory WHERE "batchNumber"='TEST-B12-GRN')=5
  AND (SELECT status FROM purchase_orders WHERE id='TEST-PO-1')='Partially Received'
  AND (SELECT "outstandingAmount" FROM vendors WHERE id='TEST-V-1')=4839+350)`;
const grnShow = `(SELECT 'stock='||(SELECT coalesce(sum(quantity),0) FROM inventory WHERE "batchNumber"='TEST-B12-GRN')||' po='||(SELECT status FROM purchase_orders WHERE id='TEST-PO-1')||' vendor='||(SELECT "outstandingAmount" FROM vendors WHERE id='TEST-V-1'))`;
S(WH, 'G1 Warehouse records a GRN -> stock, PO status, vendor balance move', GRN('GRN-TEST-B12-1'), 'ok', { assert: grnEffects, show: grnShow });
S(PM, 'G2 Purchase Manager records a GRN (control)', GRN('GRN-TEST-B12-2'), 'ok', { assert: grnEffects });
S(ACC, 'G3 Accounts (purchases view) records a GRN', GRN('GRN-TEST-B12-3'), 'refused', { msg: 'row-level security' });
S(SE1, 'G4 Sales Exec 1 records a GRN', GRN('GRN-TEST-B12-4'), 'refused', { msg: 'row-level security' });
const SEED_GRN = GRN('GRN-TEST-B12-S');
S(WH, 'G5 Warehouse edits a GRN -> nothing', `UPDATE grn SET notes='x' WHERE id='GRN-TEST-B12-S'`, 'none', { setup: SEED_GRN, assert: `(SELECT notes FROM grn WHERE id='GRN-TEST-B12-S') IS DISTINCT FROM 'x'` });
S(WH, 'G6 Warehouse deletes a GRN -> nothing', `DELETE FROM grn WHERE id='GRN-TEST-B12-S'`, 'none', { setup: SEED_GRN, assert: `(SELECT count(*) FROM grn WHERE id='GRN-TEST-B12-S')=1` });
S(WH, 'G7 Warehouse confirms a Draft PO -> nothing', `UPDATE purchase_orders SET status='Closed' WHERE id='TEST-PO-1'`, 'none', { assert: `(SELECT status FROM purchase_orders WHERE id='TEST-PO-1')='Confirmed'` });

// ── 3. Master lists readable by staff ──
for (const [email, name] of [[SE1, 'Sales Exec 1'], [SALES, 'Sales'], [WH, 'Warehouse'], [PM, 'Purchase Manager'], [ACC, 'Accounts'], [DSP, 'Dispatch'], [CS, 'Customer Support'], [SM, 'Sales Manager']]) {
  S(email, `M ${name} reads master lists`, `SELECT 1 FROM masters`, 'ok');
}
S(DI, 'M Distributor reads master lists -> none', `SELECT 1 FROM masters`, 'none');
S(DE, 'M Dealer reads master lists -> none', `SELECT 1 FROM masters`, 'none');
S(SE1, 'M Sales Exec 1 adds a master option -> refused', `INSERT INTO masters(id,list,key,label) VALUES ('M-TEST-B12-SE','lead_source','TEST B12 SE','TEST B12 SE')`, 'refused', { msg: 'row-level security' });

// ── 4. GSTIN / phone / pincode ──
const D1 = `UPDATE distributors SET`;
S(AD, 'C1 Admin sets a bad phone', `${D1} phone='1234567890' WHERE id='D-TEST-1'`, 'refused', { msg: 'Phone 1234567890 is not valid' });
S(AD, 'C2 Admin sets a short GSTIN', `${D1} gstin='24AKSP2683K' WHERE id='D-TEST-1'`, 'refused', { msg: 'GSTIN 24AKSP2683K is not valid' });
S(AD, 'C3 Admin sets a bad pincode', `${D1} pincode='012345' WHERE id='D-TEST-1'`, 'refused', { msg: 'Pincode 012345 is not valid' });
S(AD, 'C4 Admin sets a valid lower-case GSTIN -> stored in capitals', `${D1} gstin='24aaacj1234k1z5' WHERE id='D-TEST-1'`, 'ok', { assert: `(SELECT gstin FROM distributors WHERE id='D-TEST-1')='24AAACJ1234K1Z5'` });
S(AD, 'C5 Admin sets +91 mobile and landline-style phones (control)', `${D1} phone='+91 98250-11223' WHERE id='D-TEST-1'`, 'ok');
S(AD, 'C6 Admin edits an old row with a bad GSTIN/phone, other field -> allowed', `${D1} "creditLimit"="creditLimit", city=city WHERE id='DIST-1790575498428'`, 'ok');
S(AD, 'C7 Admin adds a distributor with a bad GSTIN', `INSERT INTO distributors(id,name,gstin,phone,status) VALUES ('DIST-TEST-B12','TEST B12 Dist','6789ghj','9825011223','Active')`, 'refused', { msg: 'GSTIN 6789GHJ is not valid' });
S(AD, 'C8 Admin adds a dealer with a bad phone', `INSERT INTO dealers(id,name,phone,"parentDistributorId",status) VALUES ('DEAL-TEST-B12','TEST B12 Dealer','567897567','D-TEST-1','Active')`, 'refused', { msg: 'Phone 567897567 is not valid' });
S(AD, 'C9 Admin sets a retailer pincode of 5 digits', `UPDATE retailers SET pincode='38800' WHERE id=(SELECT id FROM retailers WHERE id LIKE 'R-TEST%' LIMIT 1)`, 'refused', { msg: 'Pincode 38800 is not valid' });
S(PM, 'C10 Purchase Manager sets a vendor phone of 12 digits', `UPDATE vendors SET phone='456778564567' WHERE id='TEST-V-1'`, 'refused', { msg: 'Phone 456778564567 is not valid' });
S(PM, 'C11 Purchase Manager adds a vendor with a valid GSTIN (control)', `INSERT INTO vendors(id,name,gstin,phone,status) VALUES ('V-TEST-B12','TEST B12 Vendor','24AAACJ1234K1Z5','07926543210','Active')`, 'ok');
S(AD, 'C12 Admin clears the phone (blank allowed)', `${D1} phone='' WHERE id='D-TEST-1'`, 'ok');

// ── 5. Scheme values ──
const SCH = (id, pct, from, to) => `INSERT INTO schemes(id,name,type,"discountPct","validFrom","validTo",status,"applicableTo") VALUES ('${id}','${id}','Flat Discount',${pct},${from},${to},'Inactive','Distributor')`;
S(AD, 'S1 Admin adds a 120% scheme', SCH('TEST B12 S1', 120, 'null', 'null'), 'refused', { msg: 'schemes_discount_0_100' });
S(AD, 'S2 Admin adds a -5% scheme', SCH('TEST B12 S2', -5, 'null', 'null'), 'refused', { msg: 'schemes_discount_0_100' });
S(AD, 'S3 Admin adds a scheme ending before it starts', SCH('TEST B12 S3', 10, `'2026-12-01'`, `'2026-11-30'`), 'refused', { msg: 'schemes_dates_in_order' });
S(AD, 'S4 Admin adds a 100% one-day scheme (control)', SCH('TEST B12 S4', 100, `'2026-12-01'`, `'2026-12-01'`), 'ok');
S(AD, 'S5 Admin edits a scheme to 150%', `UPDATE schemes SET "discountPct"=150 WHERE id='SCH-1790405906612'`, 'refused', { msg: 'schemes_discount_0_100' });
S(AD, 'S6 Admin sets minimum order -1', `UPDATE schemes SET "minOrderValue"=-1 WHERE id='SCH-1790405906612'`, 'refused', { msg: 'schemes_amounts_not_negative' });

// ── 6. Product in use / 9. prices within MRP ──
S(AD, 'P1 Admin deletes a product with stock/orders/schemes', `DELETE FROM products WHERE id='TEST-P-1'`, 'refused', { msg: 'is in use' });
S(AD, 'P2 Admin renames a product in use', `UPDATE products SET name='TEST Neem Face Wash 100ml v2' WHERE id='TEST-P-1'`, 'refused', { msg: 'cannot be renamed' });
S(AD, 'P3 Admin changes only the price of a product in use (control)', `UPDATE products SET mrp=181 WHERE id='TEST-P-1'`, 'ok');
const UNUSED = `INSERT INTO products(id,name,mrp,"distributorPrice","dealerPrice","retailerPrice","gstPct") VALUES ('P-TEST-B12','TEST B12 Unused Product',100,60,70,80,12)`;
S(AD, 'P4 Admin deletes an unused product (control)', `DELETE FROM products WHERE id='P-TEST-B12'`, 'ok', { setup: UNUSED, assert: `(SELECT count(*) FROM products WHERE id='P-TEST-B12')=0` });
S(AD, 'P5 Admin renames an unused product (control)', `UPDATE products SET name='TEST B12 Renamed' WHERE id='P-TEST-B12'`, 'ok', { setup: UNUSED });
S(AD, 'P6 Admin sets dealer price above MRP', `UPDATE products SET "dealerPrice"=181 WHERE id='TEST-P-1'`, 'refused', { msg: 'products_partner_prices_within_mrp' });
S(AD, 'P7 Admin adds a product with retailer price above MRP', `INSERT INTO products(id,name,mrp,"retailerPrice","gstPct") VALUES ('P-TEST-B12-2','TEST B12 Over MRP',100,101,12)`, 'refused', { msg: 'products_partner_prices_within_mrp' });
S(AD, 'P8 Admin sets distributor price = MRP (control)', `UPDATE products SET "distributorPrice"=mrp WHERE id='TEST-P-1'`, 'ok');
S(AD, 'P9 Admin renames a product only used in a complaint', `UPDATE products SET name='TEST B12 Renamed' WHERE id='P-TEST-B12'`, 'refused', {
  setup: `${UNUSED}; INSERT INTO complaints(id,"complaintType","customerName",product,status) VALUES ('TEST-B12-CMP-P','Quality Issue','TEST B12','TEST B12 Unused Product','Registered')`, msg: '1 complaint' });

// ── 7. Duplicate master options ──
S(AD, 'D1 Admin adds lead source website (exists as Website)', `INSERT INTO masters(id,list,key,label) VALUES ('M-TEST-B12-1','lead_source','website','website')`, 'refused', { msg: 'masters_list_key_ci' });
S(AD, 'D2 Admin relabels an option to an existing label in other case', `UPDATE masters SET label='TRAVEL' WHERE list='expense_category' AND key='Fuel'`, 'refused', { msg: 'masters_list_label_ci' });
S(AD, 'D3 Admin adds a new lead source (control)', `INSERT INTO masters(id,list,key,label) VALUES ('M-TEST-B12-2','lead_source','TEST B12 Source','TEST B12 Source')`, 'ok', {
  assert: `(SELECT count(*) FROM masters WHERE list='lead_source' AND key='other')=0 AND (SELECT count(*) FROM leads WHERE "leadSource"='other')=0` });

// ── 8. Complaint numbers ──
const cmp = (name, extra = '', extraVals = '') => `INSERT INTO complaints("complaintType","customerName",status,"assignedTo"${extra}) VALUES ('Quality Issue','${name}','Registered','${EXEC1}'${extraVals})`;
const numbered = (name) => `(SELECT count(*) FROM complaints WHERE "customerName"='${name}' AND id ~ '^CMP-[0-9]+$' AND substr(id,5)::int > 5 AND id NOT IN (SELECT id FROM complaints WHERE "customerName"<>'${name}'))=1`;
const cmpShow = (name) => `(SELECT string_agg(id, ',') FROM complaints WHERE "customerName"='${name}')`;
S(CS, 'N1 Customer Support registers a complaint, no id -> CMP-6 or later', cmp('TEST B12 N1'), 'ok', { assert: numbered('TEST B12 N1'), show: cmpShow('TEST B12 N1') });
S(DI, 'N2 Distributor registers own complaint, no id', cmp('TEST B12 N2', ',"distributorId"', ",'D-TEST-1'"), 'ok', { assert: numbered('TEST B12 N2'), show: cmpShow('TEST B12 N2') });
S(CS, 'N3 Customer Support sends id CMP-5 (deleted number) -> renumbered', `INSERT INTO complaints(id,"complaintType","customerName",status) VALUES ('CMP-5','Quality Issue','TEST B12 N3','Registered')`, 'ok', { assert: `${numbered('TEST B12 N3')} AND (SELECT count(*) FROM complaints WHERE id='CMP-5')=0`, show: cmpShow('TEST B12 N3') });
S(CS, 'N4 Customer Support sends id CMP-2 (taken) -> renumbered, no clash', `INSERT INTO complaints(id,"complaintType","customerName",status) VALUES ('CMP-2','Quality Issue','TEST B12 N4','Registered')`, 'ok', { assert: numbered('TEST B12 N4'), show: cmpShow('TEST B12 N4') });
S(AD, 'N5 Admin deletes a new complaint, next one gets a higher number', cmp('TEST B12 N5b'), 'ok', {
  setup: `${cmp('TEST B12 N5a')}; DELETE FROM complaints WHERE "customerName"='TEST B12 N5a'`,
  assert: `(SELECT substr(id,5)::int FROM complaints WHERE "customerName"='TEST B12 N5b') > (SELECT max(substr(row_id,5)::int) FROM audit_log WHERE table_name='complaints' AND row_id ~ '^CMP-[0-9]+$' AND row_id <> (SELECT id FROM complaints WHERE "customerName"='TEST B12 N5b'))`,
  show: cmpShow('TEST B12 N5b') });

// ── 10. Credit limit ──
S(AD, 'L1 Admin sets a negative credit limit', `${D1} "creditLimit"=-1 WHERE id='D-TEST-1'`, 'refused', { msg: 'distributors_credit_limit_not_negative' });
S(AD, 'L2 Admin adds a retailer with a negative credit limit', `INSERT INTO retailers(id,name,"creditLimit",status) VALUES ('RET-TEST-B12','TEST B12 Ret',-100,'Active')`, 'refused', { msg: 'retailers_credit_limit_not_negative' });
S(AD, 'L3 Admin sets credit limit 0 (control)', `${D1} "creditLimit"=0 WHERE id='D-TEST-1'`, 'ok');

const mig = readFileSync('D:/PRISMORA/migrations/078_master_data_rules.sql', 'utf8');
const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; a text; s text; c text; BEGIN\n`;
if (mode === 'with') body += `  EXECUTE $mig$${mig}$mig$;\n`;
for (const st of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    ${st.setup ? `BEGIN EXECUTE '${q(st.setup)}'; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SETUP-FAILED: %', SQLERRM; END;` : ''}
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

const dir = `${tmpdir()}/prismora-b12`;
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun12.sql`;
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
  const st = byId[mm[1]];
  if (!st) { console.log(`UNKNOWN ${line}`); bad++; continue; }
  seen++;
  const refused = mm[3].startsWith('REFUSED'), rows0 = /rows=0\b/.test(mm[3]);
  let ok = mm[2] === 'refused' ? refused : mm[2] === 'none' ? (refused || rows0) : (!refused && !rows0);
  if (/IDENTITY-NOT-SET|SETUP-FAILED/.test(mm[3])) ok = false;
  if (ok && st.msg && refused && !mm[3].includes(st.msg)) ok = false;
  if (ok && st.assert && !refused && !/ASSERT=true/.test(mm[3])) ok = false;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mm[1]} => ${mm[3].replace(/\\$/, '')}`);
}
console.log(`\nmode: ${mode} migration; ${seen}/${steps.length} scenarios parsed; everything rolled back`);
if (seen !== steps.length) { console.log('INVALID RUN: not every scenario reported'); process.exit(1); }
console.log(bad ? `${bad} scenario(s) not as required` : 'all as required');
process.exit(bad ? 1 : 0);
