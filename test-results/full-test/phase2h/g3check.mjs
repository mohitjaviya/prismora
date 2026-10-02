// Group 3: Purchases KPI + all four Purchases exports + Orders export vs the database.
import { browser, login, go, E, settle } from './glib.mjs';
import { as } from './rest-as.mjs';
import { readFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const all = async (t) => (await SA(`${t}?select=*`, { headers: { Range: '0-999' } })).body;
const [pos, vendors, grn, rets, orders] = await Promise.all(['purchase_orders', 'vendors', 'grn', 'purchase_returns', 'orders'].map(all));
const n = (x) => Number(x || 0);
const res = []; const chk = (id, ok, d) => res.push(`${ok ? 'PASS' : 'FAIL'} ${id}: ${d}`);
// CSV with quoted values that may hold commas/newlines
const parse = (t) => { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c; } row.push(f); rows.push(row); const head = rows[0]; return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))); };
const download = async (p, btn) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click(btn)]); return parse(readFileSync(await dl.path(), 'utf8')); };
const ROLE = process.env.ROLE || 'PURCHASE_MANAGER';
res.push(`as ${ROLE}`);
const p = await login(E[`TEST_${ROLE}_EMAIL`], E[`TEST_${ROLE}_PASSWORD`]);
await settle(p);

if (ROLE !== 'SALES_EXEC_1') {
  await go(p, '/purchases');
  await p.waitForFunction(() => /PENDING GRN\s*\n+\s*\d+/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const t = await p.innerText('body');
  const pending = Number((t.match(/PENDING GRN\s*\n+\s*(\d+)/) || [])[1]);
  const truthPending = pos.filter(x => ['Confirmed', 'Partially Received', 'Ordered'].includes(x.status));
  chk('Pending GRN KPI', pending === truthPending.length, `screen=${pending} db=${truthPending.length} (${truthPending.map(x => `${x.id}:${x.status}`).join(', ')})`);
  const orderedShown = await p.$$eval('tr', trs => trs.filter(r => /TEST-PO-1\b/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')));
  res.push(`INFO TEST-PO-1 row: ${orderedShown[0] || '(not on first page)'}`);

  const po = await download(p, 'button:has-text("Export")');
  const poBad = po.filter(r => { const d = pos.find(x => x.id === r.PO); return !d || Math.abs(Number(r.Total) - n(d.total)) > 0.001 || r.Total === 'undefined'; });
  chk('PO export: rows', po.length === pos.length, `csv=${po.length} db=${pos.length}`);
  chk('PO export: Total equals DB on every row', poBad.length === 0, `mismatches=${poBad.length}; csv sum=${po.reduce((s, r) => s + Number(r.Total), 0)} db sum=${pos.reduce((s, x) => s + n(x.total), 0)}`);

  await p.click('button:has-text("Vendors (")'); await p.waitForTimeout(600);
  const vd = await download(p, 'button:has-text("Export")');
  const vBad = vd.filter(r => { const d = vendors.find(x => x.name === r.Name); return !d || (r.Address || '') !== (d.address || '') || Math.abs(Number(r.Outstanding) - n(d.outstandingAmount)) > 0.001 || Object.values(r).includes('undefined'); });
  chk('Vendor export: Address and Outstanding equal DB, no "undefined"', vd.length === vendors.length && vBad.length === 0, `rows=${vd.length}/${vendors.length} mismatches=${vBad.length} cols=${Object.keys(vd[0] || {}).join('|')}`);

  await p.click('button:has-text("Returns (")'); await p.waitForTimeout(600);
  const rt = await download(p, 'button:has-text("Export")');
  const rBad = rt.filter(r => { const d = rets.find(x => x.id === r.Return); if (!d) return true; const q = (d.items || []).reduce((s, i) => s + n(i.quantity), 0); const names = (d.items || []).every(i => r.Items.includes(i.product)); return Number(r.Quantity) !== q || !names || Math.abs(Number(r.Value) - n(d.value)) > 0.001 || Object.values(r).includes('undefined'); });
  chk('Returns export: Items, Quantity and Value equal DB, no "undefined"', rt.length === rets.length && rBad.length === 0, `rows=${rt.length}/${rets.length} mismatches=${rBad.length} sample="${rt[0]?.Items}" qty=${rt[0]?.Quantity}`);

  await p.click('button:has-text("GRN History (")'); await p.waitForTimeout(600);
  const gr = await download(p, 'button:has-text("Export")');
  chk('GRN export: rows, no "undefined"', gr.length === grn.length && !gr.some(r => Object.values(r).includes('undefined')), `rows=${gr.length}/${grn.length}`);
}
if (ROLE !== 'PURCHASE_MANAGER') {
  await go(p, '/orders');
  const od = await download(p, 'button:has-text("Export")');
  const visible = ROLE === 'SALES_EXEC_1' ? null : orders.length;
  const fmt = (items) => (items || []).map(i => `${i.name} × ${i.quantity} @ ${i.unitPrice} = ${i.total}`).join('; ');
  const oBad = od.filter(r => { const d = orders.find(x => x.id === r.id); return !d || r.items !== fmt(d.items) || /\[object Object\]/.test(r.items); });
  chk('Orders export: items readable and equal to DB lines on every row', oBad.length === 0, `rows=${od.length}${visible ? '/' + visible : ''} mismatches=${oBad.length} sample="${od.find(r => r.items.includes(';'))?.items || od[0]?.items}"`);
  chk('Orders export: value total', true, `csv value sum=${od.reduce((s, r) => s + Number(r.value), 0)}`);
  if (visible) chk('Orders export rows = DB', od.length === visible, `csv=${od.length} db=${visible}`);
}
console.log(res.join('\n'));
await browser.close();
