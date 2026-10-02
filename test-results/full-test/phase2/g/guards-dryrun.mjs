// Runs every guard scenario as the real role INSIDE ONE TRANSACTION THAT IS ALWAYS ROLLED BACK
// (the DO block ends in RAISE EXCEPTION), so nothing is ever changed. Prints each outcome.
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const AD = 'test.admin@prismora.test', SA = 'test.super.admin@prismora.test', DR = 'test.director@prismora.test',
      SE = 'test.sales.exec.1@prismora.test', LR = 'v72.lockout@example.test';
const steps = [];
const as = (email, id, stmt, expect, check) => steps.push({ email, id, stmt, expect, check });
const q = (s) => s.replace(/'/g, "''");

// Admin
as(AD, 'A1 Admin: user -> Super Admin', `UPDATE users SET role='Super Admin' WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(AD, 'A2 Admin: user -> Admin', `UPDATE users SET role='Admin' WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(AD, 'A3 Admin: user -> Director', `UPDATE users SET role='Director' WHERE id='U-TEST-ACCOUNTS'`, 'refused');
as(AD, 'A4 Admin promotes self to Super Admin', `UPDATE users SET role='Super Admin' WHERE id='U-TEST-ADMIN'`, 'refused');
as(AD, 'A5 Admin deactivates a Super Admin', `UPDATE users SET status='Inactive' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(AD, 'A6 Admin re-emails a Super Admin', `UPDATE users SET email='hijack@example.test' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(AD, 'A7 Admin renames a Super Admin', `UPDATE users SET name='x' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(AD, 'A8 Admin deletes a Super Admin', `DELETE FROM users WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(AD, 'A9 Admin inserts a Super Admin profile', `INSERT INTO users (id,name,email,role,status,"managedUsers") VALUES ('UV72X','TEST V72 x','v72.x@example.test','Super Admin','Active','{}')`, 'refused');
as(AD, 'A10 Admin edits the Super Admin role', `UPDATE roles SET permissions = jsonb_set(permissions,'{settings}','"none"') WHERE id='Super Admin'`, 'refused');
as(AD, 'A11 Admin deletes the Super Admin role', `DELETE FROM roles WHERE id='Super Admin'`, 'refused');
as(AD, 'A12 Admin deletes own account', `DELETE FROM users WHERE id='U-TEST-ADMIN'`, 'refused');
as(AD, 'A13 Admin removes Settings from own role (Admin)', `UPDATE roles SET permissions = jsonb_set(permissions,'{settings}','"none"') WHERE id='Admin'`, 'refused');
as(AD, 'A14 Admin switches own role off', `UPDATE roles SET active=false WHERE id='Admin'`, 'refused');
as(AD, 'A15 Admin deletes own role', `DELETE FROM roles WHERE id='Admin'`, 'refused');
as(AD, 'B1 Admin edits an ordinary user (role)', `UPDATE users SET role='Sales Executive' WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(AD, 'B2 Admin deactivates an ordinary user', `UPDATE users SET status='Inactive' WHERE id='U-TEST-DISPATCH'`, 'ok');
as(AD, 'B3 Admin edits another role (Customer Support description)', `UPDATE roles SET description='x' WHERE id='Customer Support'`, 'ok');
as(AD, 'B4 Admin deletes an ordinary user (U-TEST-RETAILER-2)', `DELETE FROM users WHERE id='U-TEST-RETAILER-2'`, 'ok', `SELECT count(*) FROM auth.users WHERE email='test.retailer.2@prismora.test'`);
// Super Admin
as(SA, 'S1 Super Admin gives Director', `UPDATE users SET role='Director' WHERE id='U-TEST-ACCOUNTS'`, 'ok');
as(SA, 'S2 Super Admin demotes the LAST Super Admin (self)', `UPDATE users SET role='Accounts' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(SA, 'S3 Super Admin deactivates self', `UPDATE users SET status='Inactive' WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(SA, 'S4 Super Admin deletes self / last Super Admin', `DELETE FROM users WHERE id='U-TEST-SUPER-ADMIN'`, 'refused');
as(SA, 'S5 Super Admin deletes the Super Admin role', `DELETE FROM roles WHERE id='Super Admin'`, 'refused');
as(SA, 'S6 Super Admin switches the Super Admin role off', `UPDATE roles SET active=false WHERE id='Super Admin'`, 'refused');
as(SA, 'S7 Super Admin edits Super Admin role description', `UPDATE roles SET description=description WHERE id='Super Admin'`, 'ok');
// Others
as(DR, 'D1 Director: user -> Super Admin', `UPDATE users SET role='Super Admin' WHERE id='U-TEST-ACCOUNTS'`, 'refused-or-0rows');
as(SE, 'E1 Sales Executive: own role -> Admin', `UPDATE users SET role='Admin' WHERE id='U-TEST-SALES-EXEC-1'`, 'refused');
// custom role with Settings = full
as(LR, 'L1 settings-full role removes its own Settings', `UPDATE roles SET permissions = jsonb_set(permissions,'{settings}','"none"') WHERE id='TEST V72 R'`, 'refused');
as(LR, 'L2 ...switches itself off', `UPDATE roles SET active=false WHERE id='TEST V72 R'`, 'refused');
as(LR, 'L3 ...deletes itself', `DELETE FROM roles WHERE id='TEST V72 R'`, 'refused');
as(LR, 'L4 ...edits its description', `UPDATE roles SET description='ok' WHERE id='TEST V72 R'`, 'ok');
as(AD, 'L5 Admin removes Settings from that other role', `UPDATE roles SET permissions = jsonb_set(permissions,'{settings}','"none"') WHERE id='TEST V72 R'`, 'ok');

let body = `DO $$ DECLARE rep text := ''; n int; c int; BEGIN\n`;
body += `  INSERT INTO roles (id,name,level,description,permissions,sort,active,"isSystem") SELECT 'TEST V72 R','TEST V72 R','staff','t',jsonb_set(permissions,'{settings}','"full"'),999,true,false FROM roles WHERE id='Customer Support';\n`;
body += `  INSERT INTO users (id,name,email,role,status,"managedUsers") VALUES ('UV72LR','TEST V72 lockout','${LR}','TEST V72 R','Active','{}');\n`;
for (const s of steps) {
  body += `  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"${s.email}"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE '${q(s.stmt)}'; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\\n' || '${q(s.id)} [want ${s.expect}] => DONE rows=' || n;${s.check ? `
    EXECUTE 'RESET ROLE'; EXECUTE '${q(s.check)}' INTO c; rep := rep || ' (login rows left in auth.users: ' || c || ')';` : ''}
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\\n' || '${q(s.id)} [want ${s.expect}] => REFUSED: ' || left(SQLERRM, 95); END IF;
  END;\n`;
}
body += `  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;\nEND $$;\n`;

const f = 'D:/PRISMORA/test-results/full-test/phase2/g/guards-dryrun.sql';
writeFileSync(f, body);
let raw;
try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${f} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e7 }); }
catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
const m = raw.match(/DRYRUN-REPORT([\s\S]*)/);
if (!m) { console.log('no report returned:\n' + raw.slice(0, 1500)); process.exit(1); }
const text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\\nCONTEXT')[0];
let bad = 0;
for (const line of text.split('\n')) {
  if (!/\[want/.test(line)) continue;
  const want = line.match(/\[want ([^\]]+)\]/)[1], refused = /=> REFUSED/.test(line), rows0 = /rows=0/.test(line);
  const okp = want === 'refused' ? refused : want === 'ok' ? (!refused && !rows0) : (refused || rows0);
  if (!okp) bad++;
  console.log(`${okp ? 'PASS' : 'FAIL'} ${line.trim().replace(/\s*\[want [^\]]+\]/, '').replace(/\\$/, '')}`);
}
console.log(bad ? `\n${bad} scenario(s) behaved wrongly (all rolled back, nothing changed)` : '\nall scenarios behaved as required (all rolled back, nothing changed)');
