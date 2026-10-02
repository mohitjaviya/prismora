import { writeFileSync } from 'node:fs';
import { as } from './rest-as.mjs';
const tag = String(Date.now()).slice(-6);
const msg = (r) => (r.body && (r.body.message || r.body.hint)) || JSON.stringify(r.body);
const post = (who, t, row) => who(t, { method: 'POST', body: JSON.stringify([row]) });
const ADMIN = await as('ADMIN'), SM = await as('SALES_MANAGER');
const made = { orders: [], leads: [] };
const lead = async (n) => { const r = await post(ADMIN, 'leads', { name: `TEST SMLead ${tag}-${n}`, company: `TEST SMCo ${tag}-${n}`, phone: '9000000098', status: 'New', leadSource: 'Website' }); made.leads.push(r.body[0].id); return r.body[0].id; };
const neem = 'TEST Neem Face Wash 100ml';
const ord = (extra) => ({ customerName: `TEST SM ${tag}`, items: [{ name: neem, quantity: 1, unitPrice: 100, total: 100, gstPct: 18 }], product: neem, quantity: 1, value: 100, state: 'Gujarat', city: 'Vadodara', status: 'Pending', ...extra });
const L1 = await lead(1);
const first = await post(ADMIN, 'orders', ord({ leadId: L1 })); made.orders.push(first.body[0].id);
console.log('setup: lead', L1, 'converted by', first.body[0].id);
// SM's own order (they can insert Pending orders), no lead yet
const mine = await post(SM, 'orders', ord({ customerName: `TEST SM own ${tag}` }));
console.log('SM creates own order:', mine.status, mine.body?.[0]?.id || msg(mine));
if (mine.body?.[0]?.id) made.orders.push(mine.body[0].id);
// Real attempts by Sales Manager
const a1 = await post(SM, 'orders', ord({ customerName: `TEST SM dup ${tag}`, leadId: L1 }));
console.log('A1 SM INSERT new order naming the converted lead:', a1.status, msg(a1).slice(0, 140));
if (a1.body?.[0]?.id) made.orders.push(a1.body[0].id);
const a2 = await SM(`orders?id=eq.${mine.body?.[0]?.id}`, { method: 'PATCH', body: JSON.stringify({ leadId: L1 }) });
console.log('A2 SM PATCH own order leadId -> converted lead:', a2.status, 'rows changed =', Array.isArray(a2.body) ? a2.body.length : msg(a2));
const a3 = await SM('rpc/sales_move_order', { method: 'POST', body: JSON.stringify({ p_order_id: mine.body?.[0]?.id, p_status: 'Processing' }) });
console.log('A3 SM sales_move_order (no lead field exists):', a3.status, msg(a3).slice(0, 100));
const chk = (await ADMIN(`orders?select=leadId&id=eq.${mine.body?.[0]?.id}`)).body?.[0]?.leadId;
console.log('DB: SM order leadId =', chk);
// which roles can edit an order's lead at all?
const tgt = (await post(ADMIN, 'orders', ord({ customerName: `TEST RoleProbe ${tag}` }))).body[0].id; made.orders.push(tgt);
for (const role of ['SUPER_ADMIN','ADMIN','DIRECTOR','SALES_MANAGER','SALES_EXEC_1','SALES','ACCOUNTS','DISPATCH','WAREHOUSE','PURCHASE_MANAGER','CUSTOMER_SUPPORT']) {
  try { const w = await as(role); const r = await w(`orders?id=eq.${tgt}`, { method: 'PATCH', body: JSON.stringify({ leadId: L1 }) });
    console.log(`probe ${role}: ${r.status} ${Array.isArray(r.body) ? (r.body.length ? 'CHANGED' : 'no rows (no edit right)') : ''} ${r.status >= 400 ? msg(r).slice(0, 90) : ''}`); } catch (e) { console.log(role, e.message); }
}
writeFileSync('sm-lead.json', JSON.stringify(made));
