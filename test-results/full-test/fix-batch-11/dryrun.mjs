// Fix batch 11 (migration 077) proven as the real roles. Harness copied from fix-batch-10/dryrun.mjs:
// migration installed INSIDE a transaction, each scenario its own sub-transaction, full identity
// (e-mail AND auth id) per step, and the whole block ends in RAISE EXCEPTION so nothing is kept.
// Usage: node dryrun.mjs [with|without]   ("without" = re-check once 077 is live, or show the old gaps)
// want 'none' = RLS hides the row: refused OR 0 rows both count, and the assert must show the row still there.
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const mode = process.argv[2] || 'with';
const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const E = (k) => env[`TEST_${k}_EMAIL`];
const SA = E('SUPER_ADMIN'), AD = E('ADMIN'), DIR = E('DIRECTOR'), SE1 = E('SALES_EXEC_1'), SE2 = E('SALES_EXEC_2'), SALES = E('SALES'),
  ACC = E('ACCOUNTS'), DSP = E('DISPATCH'), WH = E('WAREHOUSE'), PM = E('PURCHASE_MANAGER'), CS = E('CUSTOMER_SUPPORT'),
  DI = E('DISTRIBUTOR'), DE = E('DEALER'), RE = E('RETAILER'), SM = E('SALES_MANAGER');
const SE2_ID = 'U-TEST-SALES-EXEC-2', EXEC1 = 'U-TEST-SALES-EXEC-1';

const steps = [];
const S = (email, id, stmt, expect, o = {}) => steps.push({ email, id, stmt, expect, ...o });

// ── 1. Settings = full is Super Admin only ──
const FULL_ROLE = `INSERT INTO roles(id,name,permissions) VALUES ('TEST B11 Full','TEST B11 Full','{"settings":"full"}'::jsonb)`;
const settingsOf = (r) => `(SELECT coalesce(permissions->>'settings','none') FROM roles WHERE id='${r}')`;
const setSettings = (r, v) => `UPDATE roles SET permissions = permissions || '{"settings":"${v}"}'::jsonb WHERE id='${r}'`;
S(AD, 'R1 Admin gives Sales Settings=full', setSettings('Sales', 'full'), 'refused', { msg: 'full Settings access' });
S(AD, 'R2 Admin gives Sales Settings=view (control)', setSettings('Sales', 'view'), 'ok', { assert: `${settingsOf('Sales')}='view'` });
S(AD, 'R3 Admin creates a role with Settings=full', `INSERT INTO roles(id,name,permissions) VALUES ('TEST B11 R3','TEST B11 R3','{"settings":"full"}'::jsonb)`, 'refused', { msg: 'full Settings access' });
S(AD, 'R4 Admin creates a role with Settings=none (control)', `INSERT INTO roles(id,name,permissions) VALUES ('TEST B11 R4','TEST B11 R4','{"settings":"none"}'::jsonb)`, 'ok');
S(AD, 'R5 Admin edits own role, Settings stays full (control)', `UPDATE roles SET permissions = permissions || '{"claims":"full"}'::jsonb WHERE id='Admin'`, 'ok');
S(AD, 'R6 Admin takes Settings from own role (072 rule kept)', setSettings('Admin', 'view'), 'refused', { msg: 'This is your own role' });
S(AD, 'R7 Admin takes Settings=full away from another role', setSettings('TEST B11 Full', 'none'), 'refused', { setup: FULL_ROLE, msg: 'full Settings access' });
S(AD, 'R8 Admin deletes a Settings=full role', `DELETE FROM roles WHERE id='TEST B11 Full'`, 'refused', { setup: FULL_ROLE, msg: 'full Settings access' });
S(DIR, 'R9 Director gives Sales Settings=full', setSettings('Sales', 'full'), 'none', { assert: `${settingsOf('Sales')}='none'` });
S(SA, 'R10 Super Admin gives Sales Settings=full', setSettings('Sales', 'full'), 'ok', { assert: `${settingsOf('Sales')}='full'` });
S(SA, 'R11 Super Admin creates a Settings=full role', `INSERT INTO roles(id,name,permissions) VALUES ('TEST B11 R11','TEST B11 R11','{"settings":"full"}'::jsonb)`, 'ok');
S(SA, 'R12 Super Admin deletes a Settings=full role', `DELETE FROM roles WHERE id='TEST B11 Full'`, 'ok', { setup: FULL_ROLE });

// ── 2. Giving a user a Settings=full role ──
const roleOf = `(SELECT role FROM users WHERE id='${SE2_ID}')`;
S(AD, 'U1 Admin gives Sales Exec 2 a custom Settings=full role', `UPDATE users SET role='TEST B11 Full' WHERE id='${SE2_ID}'`, 'refused', { setup: FULL_ROLE, msg: 'full Settings access' });
S(AD, 'U2 Admin gives Sales Exec 2 the role Sales after Sales got Settings=full', `UPDATE users SET role='Sales' WHERE id='${SE2_ID}'`, 'refused', { setup: setSettings('Sales', 'full'), msg: 'full Settings access' });
S(AD, 'U3 Admin gives Sales Exec 2 the role Sales (control)', `UPDATE users SET role='Sales' WHERE id='${SE2_ID}'`, 'ok', { assert: `${roleOf}='Sales'` });
S(AD, 'U4 Admin gives Sales Exec 2 Director (071 rule kept)', `UPDATE users SET role='Director' WHERE id='${SE2_ID}'`, 'refused', { msg: 'Only a Super Admin can give the role Director' });
S(AD, 'U5 Admin creates a user with a Settings=full role', `INSERT INTO users(id,name,email,role,status) VALUES ('U-TEST-B11','TEST B11','test-b11@prismora.test','TEST B11 Full','Active')`, 'refused', { setup: FULL_ROLE, msg: 'full Settings access' });
S(AD, 'U6 Admin edits Sales Exec 2 name only (control)', `UPDATE users SET name=name WHERE id='${SE2_ID}'`, 'ok');
S(SA, 'U7 Super Admin gives Sales Exec 2 a Settings=full role', `UPDATE users SET role='TEST B11 Full' WHERE id='${SE2_ID}'`, 'ok', { setup: FULL_ROLE, assert: `${roleOf}='TEST B11 Full'` });

// ── 3. Events from every role, stamped by the database ──
const ev = (tag, type, extra = '') => `INSERT INTO events(id,type,message,"timestamp"${extra ? ',"actorEmail"' : ''}) VALUES ('EV-TEST-B11-${tag}','${type}','TEST B11 ${tag}','2020-01-01T00:00:00Z'${extra ? `,'${extra}'` : ''})`;
const stamped = (tag, email) => `(SELECT "actorEmail"=lower('${email}') AND "timestamp" > now() - interval '1 hour' FROM events WHERE id='EV-TEST-B11-${tag}')`;
const show = (tag) => `(SELECT coalesce("actorEmail",'<null>')||' @ '||"timestamp"::text FROM events WHERE id='EV-TEST-B11-${tag}')`;
const evRoles = [['SE1', SE1, 'Sales Exec 1', 'expense_new'], ['SALES', SALES, 'Sales', 'lead_new'], ['DSP', DSP, 'Dispatch', 'order_shipped'],
  ['WH', WH, 'Warehouse', 'sales_return'], ['PM', PM, 'Purchase Manager', 'po_created'], ['CS', CS, 'Customer Support', 'complaint_updated'],
  ['DI', DI, 'Distributor', 'complaint_registered'], ['DE', DE, 'Dealer', 'order_receipt_confirmed'], ['RE', RE, 'Retailer', 'claim_submitted'],
  ['SM', SM, 'Sales Manager', 'order_processing'], ['ACC', ACC, 'Accounts', 'invoice_new'], ['AD', AD, 'Admin', 'master_added']];
for (const [tag, email, name, type] of evRoles) {
  S(email, `E-${tag} ${name} logs ${type}, back-dated -> stamped with own e-mail and now`, ev(tag, type), 'ok', { assert: stamped(tag, email), show: show(tag) });
}
S(SE1, 'E-FORGE Sales Exec 1 names the Admin as actor -> own e-mail kept', ev('FORGE', 'visit_submitted', AD), 'ok', { assert: stamped('FORGE', SE1), show: show('FORGE') });
S(SE1, 'E-MONEY Sales Exec 1 logs a money event (invoice_new)', ev('MONEY', 'invoice_new'), 'refused', { msg: 'row-level security' });
S(SE2, 'E-INACTIVE inactive user logs an event', ev('INACT', 'lead_new'), 'refused', { setup: `UPDATE users SET status='Inactive' WHERE id='${SE2_ID}'`, msg: 'row-level security' });
const EV_SEED = `INSERT INTO events(id,type,message) VALUES ('EV-TEST-B11-SEED','lead_new','TEST B11 seed')`;
const seedMsg = `(SELECT message FROM events WHERE id='EV-TEST-B11-SEED')='TEST B11 seed'`;
S(SE1, 'E-UPD Sales Exec 1 edits an event', `UPDATE events SET message='x' WHERE id='EV-TEST-B11-SEED'`, 'none', { setup: EV_SEED, assert: seedMsg });
S(SE1, 'E-DEL Sales Exec 1 deletes an event', `DELETE FROM events WHERE id='EV-TEST-B11-SEED'`, 'none', { setup: EV_SEED, assert: seedMsg });
S(AD, 'E-AUPD Admin edits an event: actor/time kept', `UPDATE events SET message='TEST B11 edited', "actorEmail"='someone@else', "timestamp"='2020-01-01' WHERE id='EV-TEST-B11-SEED'`, 'ok', {
  setup: `INSERT INTO events(id,type,message,"actorEmail") VALUES ('EV-TEST-B11-SEED','lead_new','TEST B11 seed','seed@prismora.test')`,
  assert: `(SELECT "actorEmail"='seed@prismora.test' AND "timestamp" > now() - interval '1 hour' FROM events WHERE id='EV-TEST-B11-SEED')` });

// ── 4. Complaint delete: Super Admin and Admin only ──
const CMP = `INSERT INTO complaints(id,"complaintType","customerName","distributorId","assignedTo",status) VALUES ('CMP-TEST-B11','Product Quality','TEST B11 Customer','D-TEST-1','${EXEC1}','Open')`;
const cmpLeft = `(SELECT count(*) FROM complaints WHERE id='CMP-TEST-B11')`;
const del = `DELETE FROM complaints WHERE id='CMP-TEST-B11'`;
S(AD, 'C1 Admin deletes a complaint -> row gone', del, 'ok', { setup: CMP, assert: `${cmpLeft}=0` });
S(SA, 'C2 Super Admin deletes a complaint -> row gone', del, 'ok', { setup: CMP, assert: `${cmpLeft}=0` });
for (const [email, name] of [[CS, 'Customer Support'], [SE1, 'Sales Exec 1 (assigned)'], [SALES, 'Sales'], [DI, 'Distributor (own)'], [DIR, 'Director'], [SM, 'Sales Manager']]) {
  S(email, `C ${name} deletes a complaint -> kept`, del, 'none', { setup: CMP, assert: `${cmpLeft}=1` });
}

const mig = readFileSync('D:/PRISMORA/migrations/077_settings_tier_audit_events_complaint_delete.sql', 'utf8');
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

const dir = `${tmpdir()}/prismora-b11`;
mkdirSync(dir, { recursive: true });
const f = `${dir}/dryrun11.sql`;
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
  const st = byId[mm[1]]; seen++;
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
