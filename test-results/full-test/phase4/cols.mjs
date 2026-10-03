// RISK-COLS: every column list in DataContext.jsx against the live table (read-only).
//   code-only  = named in the list, missing on the table -> PostgREST refuses the whole write
//   table-only = on the table, not in the list -> a form value for it is silently dropped (fine for DB-stamped ones)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const src = readFileSync('D:/PRISMORA/src/context/DataContext.jsx', 'utf8');
const arr = (re) => { const m = src.match(re); if (!m) throw new Error('not found ' + re); return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]); };
const lists = {
  orders: arr(/const ORDER_COLUMNS = \[([\s\S]*?)\];/),
  leads: arr(/const LEAD_COLUMNS = \[([\s\S]*?)\];/),
  attendance: arr(/const ATTENDANCE_COLUMNS = \[([\s\S]*?)\];/),
  products: arr(/const PRODUCT_COLUMNS = \[([\s\S]*?)\];/),
  purchase_orders: arr(/const purchaseOrderRow = shapeFor\(\[([\s\S]*?)\]\)/),
  grn: arr(/const grnRow = shapeFor\(\[([\s\S]*?)\]\)/),
  vendor_payments: arr(/const vendorPaymentRow = shapeFor\(\[([\s\S]*?)\]\)/),
  inventory: arr(/const inventoryRow = shapeFor\(\[([\s\S]*?)\]\)/),
  masters: arr(/const MASTER_COLUMNS = \[([\s\S]*?)\];/),
};
const sql = `SELECT table_name t, json_agg(column_name ORDER BY ordinal_position)::text c FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${Object.keys(lists).map(t => `'${t}'`).join(',')}) GROUP BY 1`;
let raw = '';
for (let i = 0; i < 4 && !raw.trim(); i++) {
  try { raw = execSync(`node q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }); } catch (e) { raw = String(e.stdout || ''); }
}
const db = {};
const lines = raw.split('\n'), hdr = lines[0].split(' | ');
for (const l of lines.slice(1)) { const p = l.split(' | '), t = p[hdr.indexOf('t')], c = p[hdr.indexOf('c')]; if (c && c.startsWith('[')) db[t] = JSON.parse(c); }
for (const [t, list] of Object.entries(lists)) {
  if (!db[t]) { console.log(`${t}: NO TABLE ANSWER`); continue; }
  const codeOnly = list.filter(c => !db[t].includes(c)), tableOnly = db[t].filter(c => !list.includes(c));
  console.log(`${t.padEnd(16)} list ${String(list.length).padStart(2)} table ${String(db[t].length).padStart(2)} | code-only: ${codeOnly.join(',') || '-'} | table-only: ${tableOnly.join(',') || '-'}`);
}
