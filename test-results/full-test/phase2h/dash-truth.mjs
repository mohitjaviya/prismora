import { as } from './rest-as.mjs';
const SA = await as('SUPER_ADMIN');
const all = async (t) => { const r = await SA(`${t}?select=*`, { headers: { Range: '0-999' } }); return r.body; };
const [orders, leads, inv, users, dist, deal, ret, inventory, products] = await Promise.all(['orders','leads','invoices','users','distributors','dealers','retailers','inventory','products'].map(all));
const n = x => Number(x || 0); const live = orders.filter(o => o.status !== 'Cancelled');
const todayIST = new Date().toISOString().slice(0, 10);
console.log('today (UTC date)', todayIST, 'orders dated today:', live.filter(o => (o.date || o.createdAt || '').slice(0,10) === todayIST).map(o => [o.id, o.value, o.date]));
const oct = live.filter(o => { const d = new Date(o.date || o.createdAt); return d.getMonth() === 9 && d.getFullYear() === 2026; });
console.log('MTD', oct.reduce((s, o) => s + n(o.value), 0), 'YTD', live.reduce((s, o) => s + n(o.value), 0));
const conv = leads.filter(l => ['Converted','First Order','Active'].includes(l.status)).length;
console.log('leads', leads.length, 'conv', conv, (conv / leads.length * 100).toFixed(1) + '%', 'pipeline', leads.filter(l => !['Converted','First Order','Active','Lost'].includes(l.status)).reduce((s, l) => s + n(l.dealValue), 0));
console.log('lead statuses', JSON.stringify(leads.reduce((a, l) => (a[l.status] = (a[l.status] || 0) + 1, a), {})));
console.log('network', ['dist','deal','ret'].map((k, i) => { const a = [dist, deal, ret][i]; return `${k}:${a.filter(x => x.status === 'Active').length}/${a.length}/pending ${a.filter(x => x.status === 'Pending').length}`; }).join(' '));
console.log('channel outstanding', n(dist.reduce((s, d) => s + n(d.outstandingAmount), 0)), n(deal.reduce((s, d) => s + n(d.outstandingAmount), 0)), n(ret.reduce((s, d) => s + n(d.outstandingAmount), 0)));
// top products via items
const byP = {}; live.forEach(o => { const it = Array.isArray(o.items) && o.items.length ? o.items.map(i => [i.name, n(i.total)]) : [[o.product, n(o.value)]]; it.forEach(([k, v]) => byP[k] = (byP[k] || 0) + v); });
console.log('top products', JSON.stringify(Object.entries(byP).sort((a, b) => b[1] - a[1]).slice(0, 5)));
// leaderboard
const lb = users.filter(u => ['Sales Executive','Sales','Sales Manager','Manager'].includes(u.role)).map(u => [u.name, u.role, live.filter(o => o.assignedTo === u.id).length, live.filter(o => o.assignedTo === u.id).reduce((s, o) => s + n(o.value), 0)]);
console.log('leaderboard(candidate roles)', JSON.stringify(lb));
console.log('orders with null assignedTo (live):', live.filter(o => !o.assignedTo).length, 'value', live.filter(o => !o.assignedTo).reduce((s, o) => s + n(o.value), 0));
// states
const bs = {}; live.forEach(o => bs[o.state || 'Unknown'] = (bs[o.state || 'Unknown'] || 0) + n(o.value)); console.log('states', JSON.stringify(bs));
// product demand incl cancelled
const dem = {}; orders.forEach(o => dem[o.product] = (dem[o.product] || 0) + n(o.quantity)); const dem2 = {}; live.forEach(o => dem2[o.product] = (dem2[o.product] || 0) + n(o.quantity));
console.log('demand all', JSON.stringify(dem)); console.log('demand live', JSON.stringify(dem2));
// stock availability
const exp = (i) => i.expiryDate && new Date(i.expiryDate.slice(0,10) + 'T23:59:59+05:30') < new Date();
const avail = {}; inventory.forEach(i => avail[i.product] = (avail[i.product] || 0) + (exp(i) ? 0 : Math.max(0, n(i.quantity) - n(i.reserved))));
const catalog = products; console.log('catalog', catalog.length, 'out of stock', catalog.filter(p => !(avail[p.name] > 0)).length, 'low (<=50)', catalog.filter(p => avail[p.name] > 0 && avail[p.name] <= 50).map(p => [p.name, avail[p.name]]));
console.log('inventory product names not in catalog:', [...new Set(inventory.map(i => i.product))].filter(x => !catalog.find(p => p.name === x)));
