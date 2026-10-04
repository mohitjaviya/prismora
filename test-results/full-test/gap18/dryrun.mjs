// Migration 090 (Gap 18: batch number required, unique per product) proven as the real roles. Harness copied
// from gap16/dryrun.mjs: migration installed INSIDE a transaction, each scenario its own sub-transaction as the
// user (e-mail AND auth id, checked), all rolled back. Usage: node dryrun.mjs [with|without]
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const AD = env.TEST_ADMIN_EMAIL, WH = env.TEST_WAREHOUSE_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL;

const B = 'INV-ITEM-1791003427562-7c81';            // TEST Unrated Balm 25g, has a number
const BLANK = 'INV-ITEM-1790828973081-14cf';        // Neem Face Wash 100ml, one of the 4 without a number
const ABC = 'INV-ITEM-1790056118706-tnhw';          // Aloevera Skin Gel 150g "abc123" (3 batches share it)
const addBatch = (product, batch) => `INSERT INTO inventory (id, product, "batchNumber", quantity, damaged, warehouse, "unitCost", "reorderLevel", reserved, transit) VALUES ('TEST-090-NEW', '${product}', ${batch}, 5, 0, 'Main Warehouse', 50, 0, 0, 0)`;
const grn = (batch) => `INSERT INTO grn(id,"poId","vendorName",items,"receivedDate") VALUES ('GRN-T090','TEST-PO-1','TEST Herbal Raw Materials Co','[{"product":"TEST Neem Face Wash 100ml","quantity":3,"receivedQty":3,"orderedQty":200,"unitCost":70,"batchNumber":"${batch}"}]'::jsonb, now())`;
const bn = (id) => `(SELECT "batchNumber" FROM inventory WHERE id='${id}')`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

S(WH, 'N1 Add Batch without a batch number: refused', addBatch('TEST Unrated Balm 25g', 'NULL'), 'refused', { msg: 'Give the batch number' });
S(WH, 'N2 Add Batch with only spaces: refused', addBatch('TEST Unrated Balm 25g', `'   '`), 'refused', { msg: 'Give the batch number' });
S(WH, 'N3 Add Batch with a new number (spaces trimmed): allowed', addBatch('TEST Unrated Balm 25g', `'  TEST-090-A '`), 'ok', {
  assert: `${bn('TEST-090-NEW')}='TEST-090-A'` });
S(WH, 'N4 Add Batch reusing abc123 for Aloevera, other case: refused', addBatch('Aloevera Skin Gel 150g', `'ABC123'`), 'refused', { msg: 'is already used for' });
S(WH, 'N5 Add Batch reusing the TEST Balm batch number: refused', addBatch('TEST Unrated Balm 25g', bn(B)), 'refused', { msg: 'is already used for' });
S(WH, 'N6 Same number on a different product: allowed', addBatch('TEST Neem Face Wash 100ml', bn(B)), 'ok');
S(WH, 'N7 Edit an old batch without a number, number left blank (other field): allowed (form asks, DB does not)',
  `UPDATE inventory SET "reorderLevel" = 11, "batchNumber" = '' WHERE id = '${BLANK}'`, 'ok', { assert: `(SELECT "reorderLevel" FROM inventory WHERE id='${BLANK}')=11` });
S(WH, 'N8 Give an old batch a number: allowed', `UPDATE inventory SET "batchNumber" = 'TEST-090-NEEM' WHERE id = '${BLANK}'`, 'ok', { assert: `${bn(BLANK)}='TEST-090-NEEM'` });
S(WH, 'N9 Clear a batch number: refused', `UPDATE inventory SET "batchNumber" = '' WHERE id = '${B}'`, 'refused', { msg: 'Give the batch number' });
S(WH, 'N10 Rename a batch to a number the product already has: refused',
  `UPDATE inventory SET "batchNumber" = 'test-090-x' WHERE id = '${B}'`, 'refused', { msg: 'is already used for',
  setup: `INSERT INTO inventory (id, product, "batchNumber", quantity, damaged, warehouse, "unitCost", "reorderLevel", reserved, transit) VALUES ('TEST-090-X', 'TEST Unrated Balm 25g', 'TEST-090-X', 0, 0, 'Main Warehouse', 50, 0, 0, 0)` });
S(WH, 'N11 Edit one of the 3 abc123 batches, number unchanged: allowed',
  `UPDATE inventory SET "reorderLevel" = 12, "batchNumber" = 'abc123' WHERE id = '${ABC}'`, 'ok', { assert: `(SELECT "reorderLevel" FROM inventory WHERE id='${ABC}')=12` });
S(AD, 'N12 Transfer 1 unit of a batch without a number to another warehouse: allowed (same batch, not new)',
  `SELECT public.transfer_stock('${BLANK}', (SELECT name FROM warehouses WHERE name <> 'Main Warehouse' ORDER BY name LIMIT 1), 1, 'TEST 090')`, 'ok', {
  assert: `(SELECT count(*) FROM inventory WHERE product='Neem Face Wash 100ml' AND coalesce("batchNumber",'')='')=2` });
S(PM, 'N13 Goods receipt line without a batch number: refused', grn(''), 'refused', { msg: 'Give the batch number for TEST Neem Face Wash 100ml' });
S(PM, 'N14 Goods receipt with a batch number: allowed, batch created', grn('TEST-090-GRN'), 'ok', {
  assert: `EXISTS (SELECT 1 FROM inventory WHERE "batchNumber"='TEST-090-GRN')` });
const mig = readFileSync('D:/PRISMORA/migrations/090_batch_number_required.sql', 'utf8');
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

const dir = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/67487163-e8d5-42e5-9d8d-d5381a4d9427/scratchpad';
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun090.sql`;
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
