// Restore a backup made by make-backup.mjs.
//
//   node scripts/restore.mjs backups/<timestamp>            restore (commits)
//   node scripts/restore.mjs backups/<timestamp> --dry-run  same SQL, rolled back
//
// In one transaction:
//   1. undo migrations 040 and 039 if present (migrations/rollback/*_down.sql),
//      so the schema is back to what the backup was taken from;
//   2. sign-in accounts: remove ones created after the backup, put back any
//      that went missing;
//   3. every public table in the backup: emptied, then refilled from its JSON,
//      parents before children, with the app's own triggers paused so a rule
//      like "no visits on a past beat" cannot refuse old rows.
// Prints row counts after, to compare with manifest.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REF = 'qvckvvckkfvelhnxmmvp';
const [dir, flag] = process.argv.slice(2);
if (!dir || !existsSync(join(dir, 'manifest.json'))) {
  console.error('Usage: node scripts/restore.mjs backups/<timestamp> [--dry-run]');
  process.exit(1);
}
const dry = flag === '--dry-run';

function run(file) {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', 'supabase@2.117.0', 'db', 'query', '--linked', '--project-ref', REF, '--output-format', 'json', '-f', file],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: process.platform === 'win32' });
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.rows || [];
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const load = (name) => JSON.parse(readFileSync(join(dir, 'data', name), 'utf8'));

// Parent tables first, from the foreign keys as they are now.
const fkFile = join(dir, '.fk.sql');
writeFileSync(fkFile, `select c.relname as child, p.relname as parent
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
  join pg_namespace n on n.oid = c.relnamespace where k.contype = 'f' and n.nspname = 'public' and c.relname <> p.relname`);
const edges = run(fkFile);

// Writable columns per table: computed ones (auth.users.confirmed_at, for one)
// refuse a value, so each insert names only the columns it may set.
writeFileSync(fkFile, `select table_schema || '.' || table_name as t, string_agg(format('%I', column_name), ',' order by ordinal_position) as cols
  from information_schema.columns where table_schema in ('public', 'auth') and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
  group by 1`);
const colsOf = Object.fromEntries(run(fkFile).map(r => [r.t, r.cols]));
const insert = (schema, table, rows, tail = '') => {
  const cols = colsOf[`${schema}.${table}`];
  return `insert into ${schema}."${table}" (${cols}) select ${cols} from jsonb_populate_recordset(null::${schema}."${table}", ${lit(JSON.stringify(rows))}::jsonb)${tail};`;
};
const tables = readdirSync(join(dir, 'data')).filter(f => f.startsWith('public.')).map(f => f.slice(7, -5));
const order = [];
const seen = new Set();
const visit = (t, path = new Set()) => {
  if (seen.has(t) || path.has(t)) return;
  path.add(t);
  edges.filter(e => e.child === t && tables.includes(e.parent)).forEach(e => visit(e.parent, path));
  seen.add(t); order.push(t);
};
tables.forEach(t => visit(t));

const sql = ['begin;'];
sql.push(readFileSync('migrations/rollback/040_down.sql', 'utf8'));
sql.push(readFileSync('migrations/rollback/039_down.sql', 'utf8'));

// Sign-in accounts.
const authUsers = load('auth.users.json');
const authIdentities = load('auth.identities.json');
const keepIds = authUsers.map(u => lit(u.id)).join(',') || "''";
sql.push(`delete from auth.users where id::text not in (${keepIds});`);
sql.push(insert('auth', 'users', authUsers, ' on conflict (id) do nothing'));
sql.push(insert('auth', 'identities', authIdentities, ' on conflict do nothing'));

// Public data.
for (const t of order) sql.push(`alter table public."${t}" disable trigger user;`);
sql.push(`truncate ${order.map(t => `public."${t}"`).join(', ')} cascade;`);
for (const t of order) {
  const rows = load(`public.${t}.json`);
  if (rows.length) sql.push(insert('public', t, rows));
}
for (const t of order) sql.push(`alter table public."${t}" enable trigger user;`);

sql.push(`select string_agg(t || '=' || n, ' ' order by t) as counts from (${order.map(t => `select '${t}' as t, count(*) as n from public."${t}"`).join(' union all ')}) x;`);
sql.push(dry ? 'rollback;' : 'commit;');

const file = join(dir, dry ? '.restore-dry-run.sql' : '.restore.sql');
writeFileSync(file, sql.join('\n\n'));
const rows = run(file);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const got = Object.fromEntries((rows[0]?.counts || '').split(' ').filter(Boolean).map(p => p.split('=')));
const wrong = order.filter(t => String(manifest.tables[`public.${t}`]) !== String(got[t]));
console.log(dry ? 'DRY RUN (rolled back)' : 'RESTORED');
console.log(`${order.length} tables; ${wrong.length === 0 ? 'every row count matches the backup' : 'MISMATCH: ' + wrong.map(t => `${t} ${got[t]} vs ${manifest.tables['public.' + t]}`).join(', ')}`);
