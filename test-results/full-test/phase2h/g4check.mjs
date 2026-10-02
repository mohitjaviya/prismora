// Group 4: product figures (H10/H11), low stock (H12), register rounding (H15), not-found page (H16).
import { browser, login, go, E, settle } from './glib.mjs';
import { readFileSync } from 'node:fs';
// SQL truth (g4truth.sql): non-cancelled orders, by line item.
const T = { 'Aloevera Skin Gel 150g': [1331, 160400], 'Vitamin - C Face Wash': [500, 50000], 'TEST Neem Face Wash 100ml': [246, 28385], 'Neem + Aloe Hand Wash': [200, 20000], 'Tulsi Cough Syrup 100ml': [200, 14000], 'Lemon Fresh Hand Wash': [100, 10000], 'TEST Herbal Shampoo 200ml': [58, 9960], 'Lavender Body Wash': [8, 800], 'TEST Unrated Balm 25g': [4, 280] };
const res = []; const chk = (id, ok, d) => res.push(`${ok ? 'PASS' : 'FAIL'} ${id}: ${d}`);
const parse = (csv) => { const lines = csv.trim().split('\n'); const head = lines[0].split(','); return lines.slice(1).map(l => Object.fromEntries(l.slice(1, -1).split('","').map((v, i) => [head[i], v]))); };
const ROLE = process.env.ROLE || 'SUPER_ADMIN';
res.push(`as ${ROLE}`);
const p = await login(E[`TEST_${ROLE}_EMAIL`], E[`TEST_${ROLE}_PASSWORD`]);
await settle(p);

// H11/H10 — Dashboard Product Demand chart: hover each bar, read the tooltip.
if (ROLE === 'SUPER_ADMIN') {
  await p.waitForSelector('text=Product Demand', { timeout: 20000 }).catch(() => {});
  const card = p.locator('div.glass-panel:has(h3:has-text("Product Demand"))').last();
  const bars = card.locator('.recharts-line-dot, .recharts-dot');
  const nb = await bars.count();
  const seen = {};
  for (let i = 0; i < nb; i++) {
    await bars.nth(i).hover({ force: true }); await p.waitForTimeout(250);
    const tip = await card.locator('.recharts-tooltip-wrapper').innerText().catch(() => '');
    const m = tip.match(/^(.+)\n[\s\S]*?(\d[\d,]*)\s*$/);
    if (m) seen[m[1].trim()] = Number(m[2].replace(/,/g, ''));
  }
  const bad = Object.entries(T).filter(([k, [q]]) => seen[k] !== q).map(([k, [q]]) => `${k}: chart=${seen[k]} db=${q}`);
  const fake = Object.keys(seen).filter(k => /more item/.test(k) || !T[k]);
  chk('Dashboard Product Demand = DB units per product, cancelled excluded', nb === Object.keys(T).length && !bad.length && !fake.length, `bars=${nb}/${Object.keys(T).length} ${bad.join('; ') || 'all equal'}${fake.length ? ' | unexpected: ' + fake.join(', ') : ''}`);
}

await go(p, '/reports');
const open = async (cat, name) => {
  await p.click(`button:has(span.font-semibold:text-is("${cat}"))`); await p.waitForTimeout(300);
  await p.click(`button:text-is("${name}")`); await p.waitForTimeout(800);
  const table = await p.evaluate(() => ({ head: [...document.querySelectorAll('thead th')].map(x => x.innerText.trim().toLowerCase()), rows: [...document.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())) }));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('button:has-text("Export CSV")')]);
  return { table, csv: parse(readFileSync(await dl.path(), 'utf8')) };
};
const money = (s) => Number(String(s).replace(/[₹,\s]/g, ''));

const ps = await open('Sales', 'Sales by Product');
const psBad = Object.entries(T).filter(([k, [q, a]]) => { const r = ps.csv.find(x => x.Product === k); return !r || Number(r['Qty Sold']) !== q || Number(r['Order Value (₹)']) !== a; });
const psFake = ps.csv.filter(r => !T[r.Product]).map(r => r.Product);
chk('Reports Sales by Product (CSV) = DB per product', ps.csv.length === Object.keys(T).length && !psBad.length && !psFake.length, `rows=${ps.csv.length} mismatches=${psBad.map(x => x[0]).join(', ') || 0}${psFake.length ? ' unexpected: ' + psFake.join(', ') : ''}`);

const ls = await open('Inventory', 'Low Stock / Reorder Report');
await go(p, '/inventory');
const inv = await p.innerText('body');
const kpi = Number((inv.match(/LOW \/ CRITICAL\s*\n+\s*(\d+)/) || [])[1]);
chk('Low stock: Reports list = Inventory "Low / Critical" card', ls.csv.length === kpi, `reports=${ls.csv.length} inventory=${kpi} (expired batch listed: ${ls.csv.some(r => r.Batch === 'TEST-P2-EXP-26592')})`);

await go(p, '/reports');
const ir = await open('Financial', 'Invoice Register');
for (const h of ['CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total (₹)']) {
  const i = ir.table.head.indexOf(h.toLowerCase());
  const screen = Math.round(ir.table.rows.reduce((s, r) => s + money(r[i]), 0) * 100) / 100;
  const csv = Math.round(ir.csv.reduce((s, r) => s + Number(r[h]), 0) * 100) / 100;
  chk(`Invoice Register ${h}: screen column = CSV`, Math.abs(screen - csv) < 0.001, `screen=${screen} csv=${csv}`);
}
const sample = ir.table.rows.find(r => r.some(c => /\.50/.test(c)));
res.push(`INFO a row with paise on screen: ${sample ? sample.slice(0, 9).join(' | ') : '(none)'}`);

await go(p, '/no-such-page-h16');
const nf = await p.innerText('body');
chk('Unknown URL shows "Page not found" inside the app', /Page not found/.test(nf) && /no-such-page-h16/.test(nf), nf.includes('Page not found') ? 'shown, with link to dashboard: ' + /Go to the dashboard/.test(nf) : 'blank/other');
console.log(res.join('\n'));
await browser.close();
