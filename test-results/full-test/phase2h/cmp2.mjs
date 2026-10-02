import { readFileSync } from 'node:fs';
const { exp, UI } = JSON.parse(readFileSync('reports-ui.json', 'utf8'));
const parse = (csv) => { const lines = csv.trim().split('\n'); const split = (l) => l.slice(1, -1).split('","'); const head = lines[0].split(','); return { head, rows: lines.slice(1).map(split) }; };
const N = (s) => Number(String(s).replace(/[₹,]/g, ''));
const sumc = (c, label) => { const i = c.head.indexOf(label); return c.rows.reduce((s, r) => s + (Number.isFinite(N(r[i])) ? N(r[i]) : 0), 0); };
const out = [];
for (const [k, u] of Object.entries(UI)) {
  if (!u.csv) { out.push(`NOCSV ${k}`); continue; }
  const c = parse(u.csv);
  // compare every currency column: UI table sum (when all rows shown) vs CSV sum
  if (u.rows.length === c.rows.length) {
    u.head.forEach((h, i) => { const lab = c.head.find(x => x.toLowerCase() === h.toLowerCase()); if (!/\(₹\)|qty|orders|count|transactions|total$|reserved|transit|damaged/i.test(h) || !lab) return; const ui = u.rows.reduce((s, r) => s + (Number.isFinite(N(r[i])) ? N(r[i]) : 0), 0); const cs = sumc(c, lab); if (Math.abs(ui - cs) > 0.6) out.push(`DIFF ${k}/${lab}: table=${ui} csv=${cs}`); });
  } else out.push(`(table truncated ${u.rows.length}/${c.rows.length}) ${k}`);
}
const os = parse(UI.order_status.csv); out.push(`order_status CSV value=${sumc(os, 'Value (₹)')} vs db ${exp.order_status.value}; qty csv=${sumc(os, 'Qty')} db=${exp.order_status.qty}`);
const ir = parse(UI.invoice_report.csv); out.push(`invoice CSV head: ${ir.head} first=${ir.rows[0]}`);
console.log(out.join('\n'));
