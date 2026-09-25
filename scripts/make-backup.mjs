// Full logical backup of the Supabase project through the Supabase CLI's
// linked query (no Docker, no database password needed).
//
//   node scripts/make-backup.mjs
//
// Writes backups/<timestamp>/:
//   data/<schema>.<table>.json   every row of every public table, plus
//                                auth.users and auth.identities
//   schema.sql                   tables, constraints, indexes, sequences,
//                                functions, triggers, RLS flags and policies
//   manifest.json                row counts, for checking a restore
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const REF = 'qvckvvckkfvelhnxmmvp';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join('backups', stamp);
mkdirSync(join(dir, 'data'), { recursive: true });

// Each query goes through a file: passed inline, Windows splits the SQL into
// separate arguments.
const sqlFile = join(dir, '.query.sql');
function query(sql) {
  writeFileSync(sqlFile, sql);
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', 'supabase@2.117.0', 'db', 'query', '--linked', '--project-ref', REF, '--output-format', 'json', '-f', sqlFile],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: process.platform === 'win32' });
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.rows || [];
}
const q1 = (sql) => query(sql)[0];

// ── Data ─────────────────────────────────────────────────────────────────
const tables = query(`select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`).map(r => r.table_name);
const manifest = { taken: new Date().toISOString(), project: REF, tables: {} };

for (const t of tables) {
  const r = q1(`select coalesce(json_agg(x), '[]'::json) as data from public."${t}" x`);
  writeFileSync(join(dir, 'data', `public.${t}.json`), JSON.stringify(r.data, null, 1));
  manifest.tables[`public.${t}`] = r.data.length;
  console.log(`public.${t}: ${r.data.length}`);
}
for (const t of ['users', 'identities']) {
  const r = q1(`select coalesce(json_agg(x), '[]'::json) as data from auth."${t}" x`);
  writeFileSync(join(dir, 'data', `auth.${t}.json`), JSON.stringify(r.data, null, 1));
  manifest.tables[`auth.${t}`] = r.data.length;
  console.log(`auth.${t}: ${r.data.length}`);
}

// ── Schema snapshot ──────────────────────────────────────────────────────
const parts = [`-- Schema snapshot of public, taken ${manifest.taken}. Reference and rebuild aid.\n`];

parts.push(q1(`select string_agg(ddl, E'\\n\\n' order by relname) as s from (
  select c.relname, format('CREATE TABLE IF NOT EXISTS public.%I (\n%s\n);', c.relname,
    string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
      case when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
      case when a.attnotnull then ' NOT NULL' else '' end), E',\n' order by a.attnum)) as ddl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r' group by c.relname) x`).s);

parts.push(q1(`select string_agg(format('CREATE SEQUENCE IF NOT EXISTS public.%I;', relname), E'\\n') as s
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and relkind='S'`).s || '');

parts.push(q1(`select string_agg(format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid)),
  E'\\n' order by con.contype desc, c.relname, con.conname) as s
  from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'`).s || '');

parts.push(q1(`select string_agg(pg_get_indexdef(i.indexrelid) || ';', E'\\n' order by 1) as s
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)`).s || '');

parts.push(q1(`select string_agg(pg_get_functiondef(p.oid) || ';', E'\\n\\n' order by p.proname) as s
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`).s || '');

parts.push(q1(`select string_agg(pg_get_triggerdef(t.oid) || ';', E'\\n' order by 1) as s
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal`).s || '');

parts.push(q1(`select string_agg(format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', relname), E'\\n' order by relname) as s
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity`).s || '');

parts.push(q1(`select string_agg(format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;', policyname, tablename, permissive, cmd,
    array_to_string(roles, ', '),
    case when qual is not null then ' USING (' || qual || ')' else '' end,
    case when with_check is not null then ' WITH CHECK (' || with_check || ')' else '' end), E'\\n' order by tablename, policyname) as s
  from pg_policies where schemaname = 'public'`).s || '');

writeFileSync(join(dir, 'schema.sql'), parts.join('\n\n-- ─────────────────────────────────────────────\n\n'));
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nBackup written to ${dir}`);
