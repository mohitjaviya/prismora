import { browser, login, go, E } from './glib.mjs';
import { as } from './rest-as.mjs';
import { writeFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const all = async (t) => { let out = [], from = 0; for (;;) { const r = await SA(`${t}?select=*`, { headers: { Range: `${from}-${from+999}` } }); if (!Array.isArray(r.body)) throw new Error(t + JSON.stringify(r.body)); out = out.concat(r.body); if (r.body.length < 1000) break; from += 1000; } return out; };
const D = {}; for (const t of ['orders','invoices','inventory','leads','expenses','distributors','dealers','retailers','credit_notes','complaints','schemes','products']) D[t] = await all(t);
console.log('DB rows', Object.fromEntries(Object.entries(D).map(([k,v]) => [k, v.length])));
const n = (x) => Number(x || 0);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const r2 = (x) => Math.round(x * 100) / 100;
const live = D.orders.filter(o => o.status !== 'Cancelled');
const inv = D.invoices;
const total = (i) => n(i.amount) + n(i.tax);
const open = inv.filter(i => !(i.status === 'Settled' || i.status === 'Paid'));
const exp = {
  sales_summary: { rows: null, revenue: sum(live, o => n(o.value)), orders: live.length },
  product_sales: { revenue: sum(live, o => n(o.value)), qty: sum(live, o => n(o.quantity)) },
  city_sales: { revenue: sum(live, o => n(o.value)), orders: live.length },
  order_status: { rows: D.orders.length, value: sum(D.orders, o => n(o.value)), qty: sum(D.orders, o => n(o.quantity)) },
  stock_summary: { rows: D.inventory.length, qty: sum(D.inventory, i => n(i.quantity)), reserved: sum(D.inventory, i => n(i.reserved)), value: sum(D.inventory, i => n(i.quantity) * n(i.unitCost)) },
  low_stock: { rows: D.inventory.filter(i => n(i.quantity) <= n(i.reorderLevel)).length },
  invoice_report: { rows: inv.length, subtotal: sum(inv, i => n(i.amount)), cgst: sum(inv, i => n(i.cgst)), sgst: sum(inv, i => n(i.sgst)), total: sum(inv, total) },
  outstanding_receivables: { rows: open.length, total_due_by_amountDue: sum(open, i => Math.max(0, total(i) - n(i.amountPaid))), total_gross: sum(open, total) },
  expense_report: { total: sum(D.expenses, e => n(e.amount)), count: D.expenses.length },
  pl_report: { revenue_paid_incl_gst: sum(inv, i => Math.min(n(i.amountPaid), total(i))), expenses: sum(D.expenses, e => n(e.amount)) },
  gst_summary: { taxable: sum(inv, i => n(i.amount)), cgst: sum(inv, i => n(i.cgst)), sgst: sum(inv, i => n(i.sgst)), igst: sum(inv, i => n(i.igst)), total: sum(inv, total) },
  lead_summary: { count: D.leads.length, value: sum(D.leads, l => n(l.dealValue)) },
  lead_source: { count: D.leads.length },
  complaint_report: { total: D.complaints.length },
  distributor_report: { rows: D.distributors.length, outstanding: sum(D.distributors, d => n(d.outstandingAmount)) },
  scheme_usage: { rows: D.schemes.filter(s => s.status === 'Active').length },
};
const p = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
await go(p, '/reports');
const labels = { sales_summary:['Sales','Sales Summary'], product_sales:['Sales','Sales by Product'], city_sales:['Sales','Sales by City / Territory'], order_status:['Sales','Order Status Report'], stock_summary:['Inventory','Stock Summary'], low_stock:['Inventory','Low Stock / Reorder Report'], expiry_report:['Inventory','Expiry Report'], invoice_report:['Financial','Invoice Register'], outstanding_receivables:['Financial','Outstanding Receivables'], expense_report:['Financial','Expense Report'], pl_report:['Financial','P&L Summary'], gst_summary:['Financial','GST / HSN Summary (GSTR-1)'], tds_summary:['Financial','TDS Estimate Report'], lead_summary:['CRM','Lead Pipeline Summary'], lead_source:['CRM','Lead Source Report'], complaint_report:['CRM','Complaint Analysis'], sales_exec_report:['Team Performance','Sales Executive Performance'], distributor_report:['Team Performance','Distributor Outstanding Report'], scheme_usage:['Team Performance','Active Schemes Report'] };
const UI = {};
for (const [key, [cat, name]] of Object.entries(labels)) {
  await p.click(`button:has(span.font-semibold:text-is("${cat}"))`); await p.waitForTimeout(300);
  await p.click(`button:text-is("${name}")`); await p.waitForTimeout(700);
  const t = await p.evaluate(() => { const head = [...document.querySelectorAll('thead th')].map(x => x.innerText.trim()); const rows = [...document.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())); const rec = (document.body.innerText.match(/(\d+) records/) || [])[1]; return { head, rows, rec }; });
  // CSV export
  let csv = null;
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('button:has-text("Export CSV")').catch(() => {})]);
  if (dl) { const path = await dl.path(); const fs = await import('node:fs'); csv = fs.readFileSync(path, 'utf8'); }
  UI[key] = { ...t, csv };
}
writeFileSync('reports-ui.json', JSON.stringify({ exp, UI }, null, 1));
await browser.close();
console.log('done');
