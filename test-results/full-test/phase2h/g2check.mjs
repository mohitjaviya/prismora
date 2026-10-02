// Group 2: money figures on Accounting, Director, Dashboard and Reports vs SQL truth (g2truth.sql).
import { browser, login, go, E, settle } from './glib.mjs';
import { readFileSync } from 'node:fs';
const T = {
  netSales: 43112.90 - 21359.20, invoicedPaid: 43112.90, gst: 4848.10, cn: 21359.20, exp: 8300, goods: 236419,
  receivable: 42167, recCount: 22, overdue: 560, age030: 42167, owed: 27513, owingCount: 5, credit: 80096.20, creditCount: 4,
  proformaValue: 55670, proformaReceived: 53900, proformaCount: 21,
};
T.profit = T.netSales - T.exp - T.goods;
const res = [];
const rupees = (s) => { if (s == null) return NaN; const neg = /[-−]/.test(s); const v = Number(String(s).replace(/[^\d.]/g, '')); return neg ? -v : v; };
const compact = (s) => { const m = String(s).match(/₹\s*([-−]?)([\d.]+)\s*(L|k|Cr)?/); if (!m) return NaN; const mult = { L: 1e5, k: 1e3, Cr: 1e7 }[m[3]] || 1; return (m[1] ? -1 : 1) * Number(m[2]) * mult; };
const chk = (id, got, want, tol = 0.51) => res.push(`${Math.abs(got - want) <= tol ? 'PASS' : 'FAIL'} ${id}: screen=${got} db=${Math.round(want * 100) / 100}`);
const after = (t, label, re = /(-?₹[\d,.]+|₹-?[\d,.]+|−₹[\d,.]+)/) => { const i = t.indexOf(label); if (i < 0) return null; const m = t.slice(i + label.length).match(re); return m ? m[1] : null; };
const ROLE = process.env.ROLE || 'SUPER_ADMIN';
res.push(`as ${ROLE}`);
const p = await login(E[`TEST_${ROLE}_EMAIL`], E[`TEST_${ROLE}_PASSWORD`]);
await settle(p);

if (ROLE === 'DIRECTOR') {
  const t = await p.innerText('body');
  const card = (label) => { const i = t.indexOf(label); return i < 0 ? '' : t.slice(i, i + 200); };
  chk('Director Net Sales (compact)', compact(card('NET SALES (PAID)')), T.netSales, 100);
  chk('Director Net Profit (compact)', compact(card('NET PROFIT')), T.profit, 1000);
  chk('Director Costs (compact)', compact(card('COSTS')), T.exp + T.goods, 1000);
  chk('Director Total Outstanding (compact)', compact(card('TOTAL OUTSTANDING')), T.owed, 100);
  res.push(`INFO Director outstanding card: ${card('TOTAL OUTSTANDING').replace(/\n+/g, ' | ').slice(0, 160)}`);
  chk('Director Credit Held (compact)', compact(card('Total Credit Held')), T.credit, 100);
  chk('Director ageing 0-30 (compact)', compact(card('0-30 days')), T.age030, 100);
  chk('Director Overdue now', compact(card('Overdue now')), T.overdue, 1);
} else {
  // Dashboard card
  const t = await p.innerText('body');
  if (/NET SALES \(PAID\)/.test(t)) chk('Dashboard Net Sales (Paid)', rupees(after(t, 'NET SALES (PAID)')), T.netSales);
  else res.push(`INFO Dashboard sales card: ${(t.match(/ORDERS BOOKED\s*\n+\s*[^\n]+/) || ['(no Net Sales / Orders Booked card)'])[0].replace(/\n+/g, ' ')}`);
}
if (['SUPER_ADMIN', 'ACCOUNTS', 'DIRECTOR'].includes(ROLE)) {
  await go(p, '/accounting');
  await p.waitForFunction(() => /Net Sales \(Paid\)/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const a = await p.innerText('body');
  chk('Accounting Net Sales', rupees(after(a, 'Net Sales (Paid)')), T.netSales);
  chk('Accounting Invoiced and paid', rupees(after(a, 'Invoiced and paid:')), T.invoicedPaid);
  chk('Accounting Less credit notes', Math.abs(rupees(after(a, 'Less credit notes:'))), T.cn);
  chk('Accounting GST to remit', rupees(after(a, 'GST collected, to remit:')), T.gst);
  chk('Accounting Net Profit', rupees(after(a, 'Net Profit')), T.profit);
  chk('Accounting Outstanding Invoices', rupees(after(a, 'Outstanding Invoices')), T.receivable);
  chk('Accounting count of tax invoices pending', Number((a.match(/(\d+) tax invoices pending payment/) || [])[1]), T.recCount, 0);
  const pf = a.match(/Pending invoicing: (\d+) proformas, (₹[\d,]+) \((₹[\d,]+) received\)/);
  res.push(pf ? `INFO Accounting pending invoicing line: ${pf[0]}` : 'FAIL Accounting pending-invoicing line missing');
  if (pf) { chk('Accounting proforma count', Number(pf[1]), T.proformaCount, 0); chk('Accounting proforma value', rupees(pf[2]), T.proformaValue); chk('Accounting proforma received', rupees(pf[3]), T.proformaReceived); }

  await go(p, '/reports');
  const parse = (csv) => { const lines = csv.trim().split('\n'); return { head: lines[0].split(','), rows: lines.slice(1).map(l => l.slice(1, -1).split('","')) }; };
  const open = async (name) => {
    await p.click('button:has(span.font-semibold:text-is("Financial"))'); await p.waitForTimeout(300);
    await p.click(`button:text-is("${name}")`); await p.waitForTimeout(800);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('button:has-text("Export CSV")')]);
    return parse(readFileSync(await dl.path(), 'utf8'));
  };
  const pl = await open('P&L Summary');
  const v = Object.fromEntries(pl.rows.map(r => [r[0], Number(String(r[1]).replace('%', ''))]));
  chk('Reports P&L Net Sales (CSV)', v['Net Sales'], T.netSales, 0.011);
  chk('Reports P&L Net Profit (CSV)', v['Net Profit'], T.profit, 0.011);
  chk('Reports P&L Expenses', v['Expenses'], T.exp, 0.011);
  chk('Reports P&L Goods', v['Cost of Goods Purchased'], T.goods, 0.011);
  chk('Reports P&L GST to remit', v['GST Collected, to Remit (not income)'], T.gst, 0.011);
  const rc = await open('Outstanding Receivables');
  const due = rc.rows.reduce((s, r) => s + Number(r[rc.head.indexOf('Due (₹)')]), 0);
  chk('Reports Receivables rows', rc.rows.length, T.recCount, 0);
  chk('Reports Receivables Due total (CSV)', due, T.receivable, 0.011);
}
console.log(res.join('\n'));
await browser.close();
