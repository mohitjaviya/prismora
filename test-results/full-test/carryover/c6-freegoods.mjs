// C6 free-goods stock (report only, real TEST rows, cleaned up): a TEST free-goods scheme (2 free TEST Unrated Balm),
// two portal orders by TEST Distributor earn it; TEST Accounts (Incentives full, Inventory none) marks one paid in the
// browser, TEST Admin (both full) the other. Does each payout take the 2 units out of stock (with a movement row)?
// Run from Git Bash: CHROME_ARGS=--disable-quic node c6-freegoods.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { login, go, assertNotIntercepting, E } from '../phase3/lib.mjs';

const ENV = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const as = async (who) => { const c = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: E[`TEST_${who}_EMAIL`], password: E[`TEST_${who}_PASSWORD`] }); if (error) throw error; return c; };
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim()); };
const one = (sql) => db(sql)[0];
const log = (...a) => console.log(...a);
const BALM = 'TEST Unrated Balm 25g', SCH = 'SCH-TEST-C6';
const balm = () => Number(one(`SELECT sum(quantity) FROM inventory WHERE product='${BALM}'`));
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 1000)); } return null; };

const admin = await as('ADMIN'), dist = await as('DISTRIBUTOR');
const start = balm();
log('Balm units at start:', start);
const s = await admin.from('schemes').insert([{ id: SCH, name: 'TEST C6 free goods', type: 'Free Goods', discountPct: 0, freeGoodsQty: 2, freeGoodsProduct: BALM,
  minOrderValue: 0, applicableTo: 'Distributor', applicableProducts: [BALM], status: 'Active',
  validFrom: new Date(Date.now() - 86400000).toISOString(), validTo: new Date(Date.now() + 86400000).toISOString() }]).select('id');
log('scheme:', s.error?.message || 'created');
const orders = [];
for (const n of [1, 2]) {
  const o = await dist.from('orders').insert([{ customerName: `TEST C6 order ${n}`, product: BALM, quantity: 1, value: 1, status: 'Pending', items: [{ name: BALM, quantity: 1 }], distributorId: 'D-TEST-1' }]).select('id');
  orders.push(o.data?.[0]?.id); log(`order ${n}:`, o.error?.message || o.data?.[0]?.id);
}
const inc = db(`SELECT id||' '||"orderId"||' '||"incentiveType"||' '||"incentiveValue"||' '||coalesce("incentiveProduct",'-')||' '||status FROM distributor_incentives WHERE "schemeId"='${SCH}' ORDER BY "orderId"`);
log('incentives earned:', inc.join(' | '));

const results = {};
for (const [who, orderId] of [['ACCOUNTS', orders[0]], ['ADMIN', orders[1]]]) {
  const incId = one(`SELECT id FROM distributor_incentives WHERE "schemeId"='${SCH}' AND "orderId"='${orderId}'`);
  const before = balm();
  const p = await login(who); await go(p, '/incentives');
  const row = p.locator('tr', { hasText: orderId }).first();
  await row.locator('button', { hasText: 'Mark Paid' }).click();
  const paid = await waitFor(() => one(`SELECT status FROM distributor_incentives WHERE id='${incId}'`) === 'Paid');
  await p.waitForTimeout(4000);
  const shown = (await p.evaluate(() => document.body.innerText)).match(/[^\n]*(stock was short|could not|not allowed|Inventory access|failed)[^\n]*/i)?.[0] || '(no warning on screen)';
  const after = balm();
  const mv = db(`SELECT kind||' '||quantity||' by '||coalesce("createdBy",'?') FROM stock_movements WHERE note LIKE '%${incId}%'`);
  const exp = db(`SELECT id||' '||amount||' '||category FROM expenses WHERE description LIKE '%${incId}%' OR id LIKE '%${incId}%'`);
  results[who] = { incId, paid: !!paid, before, after, mv, exp, shown, problems: p.problems.filter(x => /HTTP 4|refus|Inventory/i.test(x)).slice(0, 3) };
  log(`${who}: incentive ${incId} paid=${!!paid}; Balm ${before} -> ${after}; movement rows: ${mv.join(', ') || 'none'}; expense: ${exp.join(', ') || 'none'}; screen: ${shown}; requests: ${results[who].problems.join(' | ') || '-'}`);
  await p.context().close();
}
console.log(JSON.stringify({ orders, results }));
const { browser } = await import('../phase3/lib.mjs'); await browser.close();
