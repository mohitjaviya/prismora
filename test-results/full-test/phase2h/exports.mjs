import { browser, login, go, E } from './glib.mjs';
import { as } from './rest-as.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const all = async (t) => (await SA(`${t}?select=*`, { headers: { Range: '0-999' } })).body;
const n = (x) => Number(x || 0);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const D = {};
for (const t of ['orders', 'leads', 'inventory', 'distributors', 'dealers', 'retailers', 'complaints', 'distributor_incentives', 'scheme_claims', 'products', 'schemes', 'users', 'purchase_orders', 'vendors', 'grn', 'purchase_returns']) { const r = await all(t); D[t] = Array.isArray(r) ? r : []; if (!Array.isArray(r)) console.log('table?', t, JSON.stringify(r).slice(0, 100)); }
const parseCsv = (csv) => {
  // header unquoted, values quoted
  const lines = csv.trim().split('\n'); const head = lines[0].split(',');
  return { head, rows: lines.slice(1).map(l => l.slice(1, -1).split('","')) };
};
const colSum = (c, name) => { const i = c.head.findIndex(h => h.toLowerCase() === name.toLowerCase()); if (i < 0) return NaN; return c.rows.reduce((s, r) => s + (Number(String(r[i]).replace(/[₹,]/g, '')) || 0), 0); };
const results = [];
const check = (id, shown, truth) => { const ok = Math.abs(shown - truth) < 0.51 || (Number.isNaN(shown) && Number.isNaN(truth)); results.push(`${ok ? 'OK  ' : 'FAIL'} ${id}: csv=${shown} db=${truth}`); };

const grab = async (p, path, btnText, tab) => {
  await go(p, path);
  if (tab) { await p.click(`button:has-text("${tab}")`).catch(() => {}); await p.waitForTimeout(600); }
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 6000 }).catch(() => null), p.click(`button:has-text("${btnText}")`).catch(() => {})]);
  if (!dl) return null;
  return parseCsv(readFileSync(await dl.path(), 'utf8'));
};
const p = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);

let c = await grab(p, '/orders', 'Export');
if (c) { console.log('orders cols', c.head.join('|')); check('orders rows', c.rows.length, D.orders.length); for (const h of c.head) if (/value|amount|total/i.test(h)) check(`orders ${h}`, colSum(c, h), sum(D.orders, o => n(o.value))); for (const h of c.head) if (/qty|quantity/i.test(h)) check(`orders ${h}`, colSum(c, h), sum(D.orders, o => n(o.quantity))); } else results.push('NOCSV orders');
c = await grab(p, '/leads', 'Export');
if (c) { console.log('leads cols', c.head.join('|')); check('leads rows', c.rows.length, D.leads.length); for (const h of c.head) if (/value/i.test(h)) check(`leads ${h}`, colSum(c, h), sum(D.leads, l => n(l.dealValue))); } else results.push('NOCSV leads');
c = await grab(p, '/inventory', 'Export CSV');
if (c) { console.log('inventory cols', c.head.join('|')); check('inventory rows', c.rows.length, D.inventory.length); for (const h of c.head) { if (/^(quantity|qty)$/i.test(h)) check(`inventory ${h}`, colSum(c, h), sum(D.inventory, i => n(i.quantity))); if (/stockvalue/i.test(h)) check(`inventory ${h}`, colSum(c, h), sum(D.inventory, i => n(i.quantity) * n(i.unitCost))); } } else results.push('NOCSV inventory');
for (const [path, key, label] of [['/distributors', 'distributors', 'Distributors'], ['/dealers', 'dealers', 'Dealers'], ['/retailers', 'retailers', 'Retailers']]) {
  c = await grab(p, path, 'Export');
  if (c) { check(`${label} rows`, c.rows.length, D[key].length); check(`${label} Outstanding`, colSum(c, 'Outstanding'), sum(D[key], d => n(d.outstandingAmount))); check(`${label} CreditLimit`, colSum(c, 'CreditLimit'), sum(D[key], d => n(d.creditLimit))); } else results.push(`NOCSV ${label}`);
}
c = await grab(p, '/complaints', 'Export'); if (c) check('complaints rows', c.rows.length, D.complaints.length); else results.push('NOCSV complaints');
c = await grab(p, '/incentives', 'Export'); if (c) { console.log('incentives cols', c.head.join('|')); check('incentives rows', c.rows.length, D.distributor_incentives.length); for (const h of c.head) if (/value|amount/i.test(h)) check(`incentives ${h}`, colSum(c, h), sum(D.distributor_incentives, i => n(i.incentiveValue))); } else results.push('NOCSV incentives');
c = await grab(p, '/claims', 'Export'); if (c) { console.log('claims cols', c.head.join('|')); check('claims rows', c.rows.length, D.scheme_claims.length); } else results.push('NOCSV claims');
c = await grab(p, '/schemes', 'Export'); if (c) check('schemes rows', c.rows.length, D.schemes.length); else results.push('NOCSV schemes');
c = await grab(p, '/purchases', 'Export'); if (c) { console.log('purchases cols', c.head.join('|')); check('purchase orders rows', c.rows.length, D.purchase_orders.length); for (const h of c.head) if (/value|amount|total/i.test(h)) console.log('PO', h, colSum(c, h)); } else results.push('NOCSV purchases');
writeFileSync('exports-res.txt', results.join('\n'));
console.log(results.join('\n'));
await browser.close();
