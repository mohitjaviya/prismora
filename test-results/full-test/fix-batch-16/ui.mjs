// Fix batch 16 in the browser, real roles, local app + live DB. Real TEST rows:
//  S  sign-up: a TEST distributor registers with address + pincode (Edge Function v6), then Admin rejects it.
//  F  free goods: TEST scheme "2 free Balm" + "10% on Balm"; one portal order by TEST Distributor earns both;
//     TEST Accounts (no Inventory access) pays the free goods on the Incentives screen.
//  C  claim: TEST Distributor claims ₹30 of the 10% incentive on the Claims screen; TEST Accounts settles it.
//  X  complaint: TEST Distributor raises one; stored unassigned.  K  schemes the Distributor/Dealer see.
// Run from Git Bash: CHROME_ARGS=--disable-quic node ui.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { browser, login, go, assertNotIntercepting, BASE, E } from '../phase3/lib.mjs';

const ENV = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const as = async (who) => { const c = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: E[`TEST_${who}_EMAIL`], password: E[`TEST_${who}_PASSWORD`] }); if (error) throw error; return c; };
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim()); };
const one = (sql) => db(sql)[0];
let pass = 0, fail = 0; const rows = {};
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 1000)); } return null; };
const bodyHas = async (p, re) => waitFor(async () => re.test(await p.evaluate(() => document.body.innerText)), 15000);
const BALM = 'TEST Unrated Balm 25g';
const balm = () => Number(one(`SELECT sum(quantity) FROM inventory WHERE product='${BALM}'`));
const only = process.argv.slice(2); const want = (k) => !only.length || only.includes(k);

// ── S sign-up ──
if (want('S')) {
  const email = `test.b16.${Date.now()}@prismora.test`;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } }); const p = await ctx.newPage();
  await p.goto(BASE + '/register-distributor'); await p.waitForSelector('#distributorsignup-business-name');
  await p.fill('#distributorsignup-business-name', 'TEST B16 Signup Distributor');
  await p.fill('#distributorsignup-contact-person', 'TEST B16 Person');
  await p.fill('#distributorsignup-phone', '9825011224');
  await p.fill('#distributorsignup-email-address', email);
  await p.selectOption('#distributorsignup-state', 'Gujarat');
  await p.selectOption('#distributorsignup-city-district', { index: 1 });
  const city = await p.inputValue('#distributorsignup-city-district');
  await p.fill('#distributorsignup-password', 'TestB16pass1');
  await p.locator('button[type="submit"]').first().click();
  check(await bodyHas(p, /address/i) && !(await bodyHas(p, /Registration submitted/)), 'S1 sign-up without an address is stopped with a message');
  await p.fill('#distributorsignup-address', '12 TEST Road, Ward 3');
  await p.fill('#distributorsignup-pincode', '388001');
  await p.locator('button[type="submit"]').first().click();
  check(!!(await bodyHas(p, /Registration submitted/)), 'S2 sign-up with address + pincode submitted');
  const row = await waitFor(() => one(`SELECT id||' | '||status||' | '||coalesce(address,'-')||' | '||coalesce(pincode,'-')||' | '||coalesce("territoryId",'none')||' | '||city FROM distributors WHERE lower(email)='${email}'`));
  check(!!row && /\| Pending \| 12 TEST Road, Ward 3 \| 388001 \|/.test(row), `S3 DB partner row: ${row} (city chosen ${city})`);
  rows.signup = { email, id: row?.split(' | ')[0] };
  // direct call without address/pincode: the function refuses
  const r = await fetch(`${ENV.VITE_SUPABASE_URL}/functions/v1/partner-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ENV.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${ENV.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ kind: 'distributor', name: 'TEST B16 NoAddr', contactPerson: 'x', phone: '9825011225', email: `test.b16.na.${Date.now()}@prismora.test`, password: 'TestB16pass1', state: 'Gujarat', city, website: '' }) });
  const j = await r.json().catch(() => ({}));
  check(r.status === 400 && /Address is required/.test(j.error || ''), `S4 API sign-up without address refused: HTTP ${r.status} "${j.error}"`);
  await ctx.close();
  // Admin rejects the TEST registration in the app (removes the login and the record)
  const a = await login('ADMIN'); await go(a, '/distributors');
  const tr = a.locator('tr', { hasText: 'TEST B16 Signup Distributor' }).first();
  await tr.locator('button', { hasText: /Reject/i }).click();
  await a.waitForTimeout(800);
  const confirmBtn = a.getByRole('button', { name: /^(Reject|Yes|Confirm)/ }).last(); if (await confirmBtn.count()) await confirmBtn.click();
  const gone = await waitFor(() => one(`SELECT count(*) FROM distributors WHERE lower(email)='${email}'`) === '0' && one(`SELECT count(*) FROM auth.users WHERE lower(email)='${email}'`) === '0');
  check(!!gone, 'S5 Admin rejected the TEST registration: partner record and login removed');
  await a.context().close();
}

// ── F + C free goods and claim ──
if (want('F')) {
  const admin = await as('ADMIN'), dist = await as('DISTRIBUTOR');
  const day = 86400000, from = new Date(Date.now() - day).toISOString(), to = new Date(Date.now() + day).toISOString();
  for (const s of [{ id: 'SCH-TEST-B16-FG', name: 'TEST B16 free Balm', type: 'Free Goods', discountPct: 0, freeGoodsQty: 2, freeGoodsProduct: BALM },
                   { id: 'SCH-TEST-B16-PCT', name: 'TEST B16 10pct Balm', type: 'Flat Discount', discountPct: 10, freeGoodsQty: 0 }]) {
    const r = await admin.from('schemes').insert([{ ...s, minOrderValue: 0, applicableTo: 'Distributor', applicableProducts: [BALM], status: 'Active', validFrom: from, validTo: to }]).select('id');
    console.log('scheme', s.id, r.error?.message || 'created');
  }
  const o = await dist.from('orders').insert([{ customerName: 'TEST B16 order', product: BALM, quantity: 10, value: 1, status: 'Pending', items: [{ name: BALM, quantity: 10 }], distributorId: 'D-TEST-1' }]).select('id');
  rows.order = o.data?.[0]?.id; console.log('order', rows.order, o.error?.message || '');
  const incs = db(`SELECT id||' '||"incentiveType"||' '||"incentiveValue" FROM distributor_incentives WHERE "orderId"='${rows.order}' ORDER BY "incentiveType"`);
  console.log('earned:', incs.join(' | '));
  rows.incFG = one(`SELECT id FROM distributor_incentives WHERE "orderId"='${rows.order}' AND "incentiveType"='Free Goods'`);
  rows.incCash = one(`SELECT id FROM distributor_incentives WHERE "orderId"='${rows.order}' AND "incentiveType"='Discount'`);
  check(!!rows.incFG && !!rows.incCash, `F0 order ${rows.order} earned a free-goods and a ₹ incentive`);

  // F: Accounts pays the free goods
  const before = balm();
  const ac = await login('ACCOUNTS'); await go(ac, '/incentives');
  await ac.locator('tr', { hasText: rows.incFG.slice(4, 17) }).first().locator('button', { hasText: 'Mark Paid' }).click().catch(async () => {
    await ac.locator('tr', { hasText: 'TEST B16 free Balm' }).first().locator('button', { hasText: 'Mark Paid' }).click(); });
  check(!!(await bodyHas(ac, /taken out of stock/)), 'F1 Accounts sees "Paid: 2 free unit(s) … taken out of stock"');
  const paid = await waitFor(() => one(`SELECT status FROM distributor_incentives WHERE id='${rows.incFG}'`) === 'Paid');
  const mv = db(`SELECT kind||' '||quantity||' '||"createdBy" FROM stock_movements WHERE "incentiveId"='${rows.incFG}'`);
  check(!!paid && balm() === before - 2 && mv.join(',') === 'free_goods 2 U-TEST-ACCOUNTS', `F2 DB: Paid; Balm ${before} -> ${balm()}; movement ${mv.join(', ')}`);
  await ac.context().close();

  // C: Distributor claims ₹30 of the ₹ incentive; Accounts settles
  const value = Number(one(`SELECT "incentiveValue" FROM distributor_incentives WHERE id='${rows.incCash}'`));
  const d = await login('DISTRIBUTOR'); await go(d, '/claims');
  await d.locator('button', { hasText: 'Submit Claim' }).first().click(); await d.waitForTimeout(800);
  const opts = await d.locator('#claims-incentive option').allInnerTexts();
  check(opts.some(t => /TEST B16 10pct Balm/.test(t)) && !opts.some(t => /TEST B16 free Balm/.test(t)), `C1 claim form offers the earned ₹ incentive, not the paid one: ${opts.slice(1).join(' / ')}`);
  await d.selectOption('#claims-incentive', rows.incCash);
  check(await d.inputValue('#claims-claim-amount') === String(value), `C2 amount defaults to the incentive's value (₹${value})`);
  await d.fill('#claims-claim-amount', '30'); await d.fill('#claims-notes', 'TEST B16 claim');
  await d.locator('button[type="submit"]', { hasText: 'Submit Claim' }).click();
  const claimRow = await waitFor(() => one(`SELECT id||' | '||status||' | '||amount||' | '||"schemeName"||' | '||coalesce("orderId",'-') FROM scheme_claims WHERE "incentiveId"='${rows.incCash}'`));
  check(!!claimRow && claimRow.includes(`| Pending | 30 | TEST B16 10pct Balm | ${rows.order}`), `C3 DB claim: ${claimRow}`);
  rows.claim = claimRow?.split(' | ')[0];
  await d.context().close();
  const ac2 = await login('ACCOUNTS'); await go(ac2, '/claims');
  await ac2.locator('tr', { hasText: 'TEST B16 10pct Balm' }).first().locator('button', { hasText: 'Review' }).click(); await ac2.waitForTimeout(600);
  await ac2.locator('button', { hasText: 'Settle' }).click();
  check(!!(await bodyHas(ac2, /settled: its incentive is paid/)), 'C4 Accounts settles: "its incentive is paid"');
  const settled = await waitFor(() => one(`SELECT status FROM scheme_claims WHERE id='${rows.claim}'`) === 'Settled');
  const exp = one(`SELECT category||' '||amount FROM expenses WHERE id='EXP-${rows.incCash}'`);
  check(!!settled && one(`SELECT status FROM distributor_incentives WHERE id='${rows.incCash}'`) === 'Paid' && exp === 'Scheme Claim 30', `C5 DB: claim Settled, incentive Paid, expense ${exp}`);
  await go(ac2, '/claims');
  check(await ac2.locator('tr', { hasText: 'TEST B16 10pct Balm' }).first().locator('button', { hasText: 'Review' }).count() === 0, 'C6 a settled claim offers no Review (final)');
  await ac2.context().close();
}

// ── X complaint, K schemes ──
if (want('X')) {
  const d = await login('DISTRIBUTOR'); await go(d, '/complaints');
  await d.locator('button', { hasText: /New Complaint|Raise|Register/ }).first().click(); await d.waitForTimeout(800);
  const desc = d.locator('textarea').first(); await desc.fill('TEST B16 complaint: label smudged');
  const sel = d.locator('form select'); for (let i = 0; i < await sel.count(); i++) { const n = await sel.nth(i).locator('option').count(); if (n > 1) await sel.nth(i).selectOption({ index: 1 }); }
  await d.locator('form button[type="submit"]').first().click();
  const c = await waitFor(() => one(`SELECT id||' | '||coalesce("assignedTo",'(unassigned)') FROM complaints WHERE description LIKE 'TEST B16 complaint%'`));
  check(!!c && c.endsWith('(unassigned)'), `X1 Distributor complaint stored unassigned: ${c}`);
  rows.complaint = c?.split(' | ')[0];
  await go(d, '/schemes');
  const t = await d.evaluate(() => document.body.innerText);
  check(/TEST P2F Neem 5 pct/.test(t) && !/monsoon mega sale|TEST Distributor Scheme 5pct/.test(t), 'K1 Distributor Schemes shows only the Active scheme for distributors');
  await d.context().close();
  const de = await login('DEALER'); await go(de, '/schemes');
  const t2 = await de.evaluate(() => document.body.innerText);
  check(!/TEST P2F Neem 5 pct|monsoon mega sale|TEST Distributor Scheme 5pct/.test(t2), 'K2 Dealer Schemes shows none of the distributor schemes');
  await de.context().close();
}
writeFileSync('ui-rows.json', JSON.stringify(rows, null, 2));
console.log(`\nUI: ${pass} pass, ${fail} fail`); console.log('TEST rows:', JSON.stringify(rows));
await browser.close();
