// Group 1: Invoice Register and GSTR-1 vs the stored invoice split. BASE env picks local/live.
import { browser, login, go, E } from './glib.mjs';
import { as } from './rest-as.mjs';
import { readFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const inv = (await SA('invoices?select=*', { headers: { Range: '0-999' } })).body;
const tax = inv.filter(i => i.invoiceType !== 'auto_draft');
const n = (x) => Number(x || 0); const S = (a, f) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100;
const truth = { rows: tax.length, subtotal: S(tax, i => n(i.amount)), cgst: S(tax, i => n(i.cgst)), sgst: S(tax, i => n(i.sgst)), igst: S(tax, i => n(i.igst)), total: S(tax, i => n(i.amount) + n(i.tax)) };
console.log('DB tax invoices', JSON.stringify(truth), '| proformas', inv.length - tax.length);
const byId = Object.fromEntries(inv.map(i => [i.id, i]));
const R = process.env.ROLE || 'SUPER_ADMIN'; console.log('as', R); const p = await login(E[`TEST_${R}_EMAIL`], E[`TEST_${R}_PASSWORD`]);
await go(p, '/reports');
const parse = (csv) => { const lines = csv.trim().split('\n'); return { head: lines[0].split(','), rows: lines.slice(1).map(l => l.slice(1, -1).split('","')) }; };
const open = async (name) => {
  await p.click('button:has(span.font-semibold:text-is("Financial"))'); await p.waitForTimeout(300);
  await p.click(`button:text-is("${name}")`); await p.waitForTimeout(800);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('button:has-text("Export CSV")')]);
  return parse(readFileSync(await dl.path(), 'utf8'));
};
const res = []; const chk = (id, got, want) => res.push(`${Math.abs(got - want) < 0.011 ? 'PASS' : 'FAIL'} ${id}: got=${got} db=${want}`);
const col = (c, h) => { const i = c.head.indexOf(h); return c.rows.map(r => Number(r[i])); };
const sum = (a) => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;

const reg = await open('Invoice Register');
chk('Register rows = tax invoices', reg.rows.length, truth.rows);
for (const [h, k] of [['Subtotal (₹)', 'subtotal'], ['CGST (₹)', 'cgst'], ['SGST (₹)', 'sgst'], ['IGST (₹)', 'igst'], ['Total (₹)', 'total']]) chk(`Register ${h} total`, sum(col(reg, h)), truth[k]);
// row by row
let rowBad = 0; const idI = reg.head.indexOf('Invoice ID');
for (const r of reg.rows) { const d = byId[r[idI]]; if (!d || d.invoiceType === 'auto_draft') { rowBad++; continue; }
  for (const [h, f] of [['CGST (₹)', 'cgst'], ['SGST (₹)', 'sgst'], ['IGST (₹)', 'igst']]) if (Math.abs(Number(r[reg.head.indexOf(h)]) - n(d[f])) > 0.001) rowBad++;
  if (r[reg.head.indexOf('Place of Supply')] !== d.placeOfSupply) rowBad++; }
chk('Register: every row equals its stored invoice (mismatches)', rowBad, 0);
// the known cases
for (const id of ['INV-1790599466447', 'INV-1790599467963', 'INV-1790599472882', 'INV-1790855693770']) {
  const r = reg.rows.find(x => x[idI] === id); const d = byId[id];
  res.push(`INFO ${id} ${d.sellerState}->${d.placeOfSupply} ${d.supplyType}: CSV cgst=${r?.[reg.head.indexOf('CGST (₹)')]} sgst=${r?.[reg.head.indexOf('SGST (₹)')]} igst=${r?.[reg.head.indexOf('IGST (₹)')]} | DB ${d.cgst}/${d.sgst}/${d.igst}`);
}
const g = await open('GST / HSN Summary (GSTR-1)');
for (const [h, k] of [['Taxable Value (₹)', 'subtotal'], ['CGST (₹)', 'cgst'], ['SGST (₹)', 'sgst'], ['IGST (₹)', 'igst'], ['Total (₹)', 'total']]) chk(`GSTR-1 ${h} total`, sum(col(g, h)), truth[k]);
// screen cards: visible table total rows
const screenRows = await p.$$eval('tbody tr', t => t.length); res.push(`INFO GSTR-1 rows on screen ${screenRows}, CSV ${g.rows.length}`);
console.log(res.join('\n'));
await browser.close();
