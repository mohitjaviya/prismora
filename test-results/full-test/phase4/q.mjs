// Read-only SQL runner: node q.mjs file.sql  (or -e "SQL"). Retries empty answers (known CLI gotcha).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
let sql = process.argv[2] === '-e' ? process.argv[3] : readFileSync(process.argv[2], 'utf8');
const f = mkdtempSync(tmpdir() + '/p4-') + '/q.sql';
writeFileSync(f, sql);
for (let i = 0; i < 4; i++) {
  let raw;
  try { raw = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -o json -f "${f}"`, { cwd: 'D:/PRISMORA', encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { raw = String(e.stdout || '') + String(e.stderr || ''); }
  if (raw.trim()) {
    let j; try { j = JSON.parse(raw.slice(raw.indexOf("{"))); } catch { console.log(raw.trim()); process.exit(0); }
    const rows = j.rows || [];
    if (rows.length) { console.log(Object.keys(rows[0]).join(" | ")); for (const r of rows) console.log(Object.values(r).map(v => v !== null && typeof v === "object" ? JSON.stringify(v) : v).join(" | ")); }
    console.log(`(${rows.length} rows)`); process.exit(0);
  }
}
console.log('EMPTY after 4 tries'); process.exit(1);
