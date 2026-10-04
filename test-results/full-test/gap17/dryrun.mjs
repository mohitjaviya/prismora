// Migration 091 (Gap 17: expired stock written off / returned to the vendor) proven as the real roles.
// Harness copied from gap16/dryrun.mjs: 087 (prerequisite) and 091 installed INSIDE a transaction, each scenario
// its own sub-transaction as the user (e-mail AND auth id, checked), all rolled back. Batch TEST-P3-B1 (TEST
// Unrated Balm 25g, supplied by TEST-P3 Vendor at Rs 50) is made expired (2 days ago) by the setup.
// Usage: node dryrun.mjs [with|without]   ("without" = 087 only)
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SA = env.TEST_SUPER_ADMIN_EMAIL, AD = env.TEST_ADMIN_EMAIL, WH = env.TEST_WAREHOUSE_EMAIL, AC = env.TEST_ACCOUNTS_EMAIL, PM = env.TEST_PURCHASE_MANAGER_EMAIL;

const B = 'INV-ITEM-1791003427562-7c81', VEND = 'V1791003129329', OTHER_VEND = 'TEST-V-1';
const expire = `UPDATE inventory SET "expiryDate" = now() - interval '2 days', reserved = 0 WHERE id = '${B}'`;
const qty = `(SELECT quantity FROM inventory WHERE id='${B}')`;
const owed = `(SELECT "outstandingAmount" FROM vendors WHERE id='${VEND}')`;
const lastMove = (kind) => `(SELECT m FROM stock_movements m WHERE "inventoryId"='${B}' AND kind='${kind}' ORDER BY id DESC LIMIT 1)`;
const show = `'qty '||${qty}||', vendor owed '||${owed}`;
const snap = `${expire}; CREATE TEMP TABLE b091 ON COMMIT DROP AS SELECT ${qty} q, ${owed} o`;
const asUser = (email, sql) => `SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','email',lower(email),'sub',id)::text FROM auth.users WHERE lower(email)=lower('${email}')), true); SET LOCAL ROLE authenticated; ${sql}; RESET ROLE`;

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, setup: snap, show, ...o });

S(WH, 'E1 Warehouse Manager writes off 1 expired unit with a reason: qty -1, movement row with reason and person',
  `SELECT public.write_off_expired('${B}', 1, 'TEST 091 expired, destroyed')`, 'ok', {
  assert: `${qty}=(SELECT q FROM b091)-1 AND (${lastMove('expired_write_off')}).quantity=1 AND (${lastMove('expired_write_off')}).note='TEST 091 expired, destroyed' AND (${lastMove('expired_write_off')})."createdBy" IS NOT NULL` });
S(WH, 'E2 Write-off without a reason: refused', `SELECT public.write_off_expired('${B}', 1, ' ')`, 'refused', { msg: 'Give the reason' });
S(WH, 'E3 Write-off of more than the batch holds: refused', `SELECT public.write_off_expired('${B}', 9999, 'TEST 091')`, 'refused', { msg: 'not reserved, so 9999 cannot be moved' });
S(AC, 'E4 Accounts may not write off expired', `SELECT public.write_off_expired('${B}', 1, 'TEST 091')`, 'refused', { msg: 'Only Admin or Warehouse Manager' });
S(WH, 'E5 A batch that has not expired: refused', `SELECT public.write_off_expired('${B}', 1, 'TEST 091')`, 'refused', { msg: 'has not expired',
  setup: `UPDATE inventory SET "expiryDate" = now() + interval '30 days' WHERE id = '${B}'` });
S(AD, 'E6 Admin returns 1 expired unit to the vendor at Rs 50: qty -1, vendor owed 50 less, purchase return Expired stock + movement',
  `SELECT public.return_expired_to_vendor('${B}', '${VEND}', 1, 50, 'TEST 091 vendor takes back expired')`, 'ok', {
  assert: `${qty}=(SELECT q FROM b091)-1 AND ${owed}=(SELECT o FROM b091)-50 AND (${lastMove('expired_to_vendor')}).quantity=1 AND EXISTS (SELECT 1 FROM purchase_returns r WHERE r.id=(${lastMove('expired_to_vendor')})."returnId" AND r.value=50 AND r.reason='Expired stock')` });
S(AD, 'E7 Vendor that never supplied the product: refused', `SELECT public.return_expired_to_vendor('${B}', '${OTHER_VEND}', 1, 1, 'TEST 091')`, 'refused', { msg: 'has never delivered' });
S(AD, 'E8 Unit cost above what the vendor ever charged: refused', `SELECT public.return_expired_to_vendor('${B}', '${VEND}', 1, 999, 'TEST 091')`, 'refused', { msg: 'is above the most' });
S(PM, 'E9 Purchase Manager may not return expired stock', `SELECT public.return_expired_to_vendor('${B}', '${VEND}', 1, 50, 'TEST 091')`, 'refused', { msg: 'Only Admin or Warehouse Manager' });
S(PM, 'E10 Withdrawing an expired-goods vendor return: refused',
  `SELECT public.withdraw_purchase_return((SELECT "returnId" FROM stock_movements WHERE kind='expired_to_vendor' AND "inventoryId"='${B}' ORDER BY id DESC LIMIT 1))`, 'refused', {
  setup: `${snap}; ${asUser(AD, `SELECT public.return_expired_to_vendor('${B}', '${VEND}', 1, 50, 'TEST 091 for withdraw')`)}`,
  msg: 'sent expired goods back' });
S(PM, 'E11 An ordinary purchase return can still be withdrawn (withdraw redefined)',
  `SELECT public.withdraw_purchase_return((SELECT id FROM purchase_returns WHERE notes='TEST 091 ordinary'))`, 'ok', {
  setup: `${snap}; ${asUser(PM, `SELECT public.record_purchase_return('${VEND}', 'Other', '[{"product":"TEST Unrated Balm 25g","quantity":1,"unitCost":50}]'::jsonb, 'TEST 091 ordinary')`)}`,
  assert: `${qty}=(SELECT q FROM b091) AND NOT EXISTS (SELECT 1 FROM purchase_returns WHERE notes='TEST 091 ordinary')` });
S(SA, 'E12 Super Admin may also write off expired', `SELECT public.write_off_expired('${B}', 1, 'TEST 091 super admin')`, 'ok', { assert: `${qty}=(SELECT q FROM b091)-1` });
S(WH, 'E13 The screen check stock_expired_moves_enabled() answers', 'SELECT public.stock_expired_moves_enabled()', 'ok', { allow0: true });

const pre = readFileSync('D:/PRISMORA/migrations/087_damaged_stock_locked.sql', 'utf8');
const mig = readFileSync('D:/PRISMORA/migrations/091_expired_stock_moves.sql', 'utf8');
const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; a text; s text; c text; BEGIN\n`;
body += `  EXECUTE $mig$${pre}$mig$;\n`;
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
const f = `${dir}/dryrun091.sql`;
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
console.log(`\nmode: ${mode} migration (087 always installed first); ${seen}/${steps.length} scenarios parsed; everything rolled back`);
if (seen !== steps.length) { console.log('INVALID RUN: not every scenario reported'); process.exit(1); }
console.log(bad ? `${bad} scenario(s) not as required` : 'all as required');
process.exit(bad ? 1 : 0);
