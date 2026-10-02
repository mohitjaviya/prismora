// Migration 073 proven BEFORE it is applied: the migration is installed INSIDE the transaction, the
// scenarios run as the real roles, and the whole thing is rolled back (the block ends in RAISE EXCEPTION).
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const AD = 'test.admin@prismora.test', SA = 'test.super.admin@prismora.test', SE = 'test.sales.exec.1@prismora.test';
const mig = readFileSync('D:/PRISMORA/migrations/073_user_email_locked.sql', 'utf8');
const steps = [];
const as = (email, id, stmt, expect, role = 'authenticated') => steps.push({ email, id, stmt, expect, role });
as(AD, 'A1 Admin changes an ordinary user\'s e-mail', `UPDATE users SET email='moved@example.test' WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(AD, 'A2 Admin changes only the CASE of an e-mail', `UPDATE users SET email=upper(email) WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(AD, 'A3 Admin changes another Admin\'s e-mail (own row)', `UPDATE users SET email='me@example.test' WHERE id='U-TEST-ADMIN'`, 'refused');
as(SA, 'S1 Super Admin changes an ordinary user\'s e-mail', `UPDATE users SET email='moved@example.test' WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(SA, 'S2 Super Admin changes their own e-mail', `UPDATE users SET email='sa@example.test' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(SE, 'E1 Sales Executive changes their own e-mail', `UPDATE users SET email='se@example.test' WHERE id='U-TEST-SALES-EXEC-1'`, 'refused');
as(AD, 'B1 Admin edits a name (e-mail untouched)', `UPDATE users SET name='x' WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(AD, 'B2 Admin saves the SAME e-mail', `UPDATE users SET email=email WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(AD, 'B3 Admin edits role + status (e-mail untouched)', `UPDATE users SET role='Sales Executive', status='Active' WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(SA, 'B4 Super Admin edits a name', `UPDATE users SET name='y' WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(SE, 'B5 Sales Executive edits their own name', `UPDATE users SET name='z' WHERE id='U-TEST-SALES-EXEC-1'`, 'ok');
as('svc@example.test', 'V1 service key (Edge function) may still change an e-mail', `UPDATE users SET email='svc-moved@example.test' WHERE id='U-TEST-ACCOUNTS'`, 'ok', 'service_role');

const q = (s) => s.replace(/'/g, "''");
let body = `DO $dry$ DECLARE rep text := ''; n int; BEGIN\n  EXECUTE $mig$${mig}$mig$;\n`;
for (const s of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"${s.role}","email":"${s.email}"}', true);
    EXECUTE 'SET LOCAL ROLE ${s.role}';
    EXECUTE '${q(s.stmt)}'; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\\n' || '${q(s.id)} [want ${s.expect}] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\\n' || '${q(s.id)} [want ${s.expect}] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;\n`;
}
body += `  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;\nEND $dry$;\n`;
const f = 'D:/PRISMORA/test-results/full-test/phase2/g/email-lock-dryrun.sql';
writeFileSync(f, body);
let raw;
try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${f} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
const m = raw.match(/DRYRUN-REPORT([\s\S]*)/);
if (!m) { console.log('no report returned:\n' + raw.slice(0, 1500)); process.exit(1); }
const text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\\nCONTEXT')[0];
let bad = 0, seen = 0;
for (const line of text.split('\n')) {
  if (!/\[want/.test(line)) continue;
  const want = line.match(/\[want ([^\]]+)\]/)[1], refused = /=> REFUSED/.test(line), rows0 = /rows=0/.test(line);
  const okp = want === 'refused' ? refused : (!refused && !rows0);
  seen++; if (!okp) bad++;
  console.log(`${okp ? 'PASS' : 'FAIL'} ${line.trim().replace(/\s*\[want [^\]]+\]/, '').replace(/\\$/, '')}`);
}
if (seen !== steps.length) { console.log(`
INVALID RUN: parsed ${seen} of ${steps.length} scenarios`); process.exit(1); }
console.log(bad ? `\n${bad} scenario(s) behaved wrongly (all rolled back, nothing changed)` : '\nall scenarios behaved as required (all rolled back, 073 NOT applied, nothing changed)');
