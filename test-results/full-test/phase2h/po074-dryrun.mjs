// Migration 074 proven BEFORE it is applied (and re-checked after, with WITH_MIGRATION=0 once live):
// the migration is installed INSIDE a transaction, goods are received as the real Purchase Manager,
// and the whole block ends in RAISE EXCEPTION so nothing is kept.
// Usage: node po074-dryrun.mjs [with|without]
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'with';
const PM = 'test.purchase.manager@prismora.test';
const mig = readFileSync('D:/PRISMORA/migrations/074_ordered_pos_to_confirmed.sql', 'utf8')
  .replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');
const grnRow = (id, po, product) => `INSERT INTO grn (id, "poId", "vendorName", items, "receivedDate", "receivedBy") VALUES ('${id}', '${po}', 'TEST dry run', '[{"product":"${product}","quantity":5,"unitCost":70,"batchNumber":"TEST-B4","expiryDate":null}]'::jsonb, now(), 'U-TEST-PURCHASE-MANAGER')`;
const q = (s) => s.replace(/'/g, "''");
const step = (id, stmt) => `  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"${PM}"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE '${q(stmt)}';
    EXECUTE 'RESET ROLE';
    SELECT status INTO st FROM purchase_orders WHERE id = 'TEST-PO-1';
    SELECT coalesce(sum(quantity),0) INTO qty FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
    SELECT "outstandingAmount" INTO bal FROM vendors WHERE id = 'TEST-V-1';
    rep := rep || E'\\n' || '${q(id)} => RECEIVED; TEST-PO-1 now ' || st || '; TEST Neem stock ' || qty0 || ' -> ' || qty || '; TEST-V-1 owed ' || bal0 || ' -> ' || bal;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || E'\\n' || '${q(id)} => REFUSED: ' || left(SQLERRM, 140);
  END;
`;
let body = `DO $dry$ DECLARE rep text := ''; st text; qty numeric; qty0 numeric; bal numeric; bal0 numeric; n int; BEGIN
  SELECT coalesce(sum(quantity),0) INTO qty0 FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
  SELECT "outstandingAmount" INTO bal0 FROM vendors WHERE id = 'TEST-V-1';
`;
if (mode === 'with') {
  body += `  EXECUTE $mig$${mig}$mig$;
  SELECT string_agg(id || '=' || status, ', ' ORDER BY id) INTO st FROM purchase_orders WHERE id IN ('TEST-PO-1','TEST-PO-PM');
  rep := rep || E'\\n' || 'M1 after 074: ' || st;
  SELECT count(*) INTO n FROM audit_log WHERE table_name = 'purchase_orders' AND row_id IN ('TEST-PO-1','TEST-PO-PM') AND via LIKE 'migration 074%' AND changes->'status' = '["Ordered","Confirmed"]'::jsonb;
  rep := rep || E'\\n' || 'M2 audit rows with the reason: ' || n;
`;
}
body += step('G1 Purchase Manager receives 5 x TEST Neem on TEST-PO-1', grnRow('TEST-GRN-DRY-1', 'TEST-PO-1', 'TEST Neem Face Wash 100ml'));
body += step('G2 Purchase Manager receives 5 x TEST Neem on TEST-PO-PM (a PO with no lines)', grnRow('TEST-GRN-DRY-2', 'TEST-PO-PM', 'TEST Neem Face Wash 100ml'));
body += `  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;\nEND $dry$;\n`;

const f = `D:/PRISMORA/test-results/full-test/phase2h/po074-dryrun-${mode}.sql`;
writeFileSync(f, body);
let raw;
try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${f} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
const m = raw.match(/DRYRUN-REPORT([\s\S]*)/);
if (!m) { console.log('no report returned:\n' + raw.slice(0, 1500)); process.exit(1); }
const lines = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\\nCONTEXT')[0].split('\n').filter(l => /^[MG]\d/.test(l.trim()));
const expected = mode === 'with' ? 4 : 2;
console.log(`mode: ${mode} migration (everything rolled back)`);
lines.forEach(l => console.log('  ' + l.trim().replace(/\\$/, '')));
if (lines.length !== expected) { console.log(`INVALID RUN: parsed ${lines.length} of ${expected} lines`); process.exit(1); }
