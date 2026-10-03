// Run SQL steps as real signed-in users, everything rolled back (batch 9 harness pattern: e-mail AND sub,
// identity verified, each step its own sub-transaction, whole block ends in RAISE so nothing is kept).
// Usage: import { run } from './rolerun.mjs'; await run([{ who: 'ACCOUNTS', id: 'X1', sql: 'SELECT ...' }])
// A step's sql is a query; its rows come back as JSON text. Set write:true for a statement (returns row count).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const env = {};
for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
export const email = (who) => { const e = env[`TEST_${who}_EMAIL`]; if (!e) throw new Error(`no TEST_${who}_EMAIL`); return e; };
const q = (s) => s.replace(/'/g, "''");

export function run(steps) {
  let body = `DO $rr$ DECLARE rep text := ''; n int; c text; r text; BEGIN\n`;
  for (const st of steps) {
    const ident = st.who === 'SQL' ? '' : `
    SELECT jsonb_build_object('role','authenticated','email',lower(u.email),'sub',u.id)::text INTO c FROM auth.users u WHERE lower(u.email)=lower('${q(email(st.who))}');
    IF c IS NULL THEN RAISE EXCEPTION 'IDENTITY-NOT-SET: no login'; END IF;
    PERFORM set_config('request.jwt.claims', c, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF auth.uid() IS NULL OR public.current_app_email() IS NULL THEN RAISE EXCEPTION 'IDENTITY-NOT-SET'; END IF;`;
    const exec = st.write
      ? `EXECUTE '${q(st.sql)}'; GET DIAGNOSTICS n = ROW_COUNT; r := 'rows=' || n;`
      : `EXECUTE 'SELECT coalesce(json_agg(_r)::text, ''[]'') FROM (${q(st.sql)}) _r' INTO r;`;
    body += `  BEGIN
    EXECUTE 'RESET ROLE';
    ${st.setup ? `EXECUTE '${q(st.setup)}';` : ''}${ident}
    ${exec}
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    ${st.check ? `EXECUTE 'SELECT coalesce(json_agg(_r)::text, ''[]'') FROM (${q(st.check)}) _r' INTO c; r := r || ' CHECK ' || c;` : ''}
    rep := rep || E'\\n@@' || '${q(st.id)}' || ' OK ' || coalesce(r, 'null');
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\\n@@' || '${q(st.id)}' || ' REFUSED ' || replace(left(SQLERRM, 300), E'\\n', ' '); END IF;
  END;\n`;
  }
  body += `  RAISE EXCEPTION E'RRREPORT%', rep;\nEND $rr$;\n`;
  const f = mkdtempSync(tmpdir() + '/rr-') + '/q.sql';
  writeFileSync(f, body);
  for (let i = 0; i < 4; i++) {
    let raw;
    try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f "${f}" 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e8 }); }
    catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
    const m = raw.match(/RRREPORT([\s\S]*)/);
    if (!m) { if (raw.trim()) { console.log(raw.slice(0, 2000)); throw new Error('no report'); } continue; }
    const text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').split('\nCONTEXT')[0];
    const out = {};
    for (const part of text.split('\n@@').slice(1)) {
      const mm = part.match(/^(\S+) (OK|REFUSED) ([\s\S]*)$/);
      if (mm) out[mm[1]] = { ok: mm[2] === 'OK', text: mm[3].replace(/"\s*}\s*$/, '').trim() };
    }
    const missing = steps.filter(s => !out[s.id]).map(s => s.id);
    if (missing.length) throw new Error('INVALID RUN: steps not reported: ' + missing.join(','));
    for (const s of steps) if (/IDENTITY-NOT-SET/.test(out[s.id].text)) throw new Error(`identity not set for ${s.id}`);
    return out;
  }
  throw new Error('empty answer 4 times');
}
