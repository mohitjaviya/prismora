// Gap 9 follow-up, in the browser (local dev, port 5174, Super Admin).
// NOTHING IS SAVED: every write request to Supabase is aborted and counted (`blocked`), and each
// scenario submits a form that must be refused on screen. A write attempt means the screen
// rules did not stop it.   Run: CHROME_ARGS=--disable-quic node ui.mjs
import { login, go } from '../phase3/lib.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const page = await login(process.env.ROLE || 'SUPER_ADMIN');
const blocked = [];
await page.route(/\/(rest|functions)\/v1\//, (route) => {
  const r = route.request();
  const url = r.url();
  const m = r.method();
  const rpc = /\/rpc\/(\w+)/.exec(url)?.[1];
  const writeRpc = rpc && /^(record_|adjust_|count_|transfer_|write_off|return_|convert|pay_|add_|create_|delete_|update_|correct_)/.test(rpc);
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || (rpc && !writeRpc)) return route.continue();
  blocked.push(`${m} ${url.split('/v1/')[1].slice(0, 60)}`);
  return route.abort();
});

let pass = 0; let fail = 0;
const check = (ok, what, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? '  -> ' + extra : ''}`); };
const wait = (ms) => page.waitForTimeout(ms);

// What the user sees: the messages under fields, the list near Save, the focused field, how far the form scrolled.
const seen = () => page.evaluate(() => {
  const root = [...document.querySelectorAll('.fixed.inset-0')].pop() || document;
  const msgs = [...root.querySelectorAll('[data-field-error]')].map(e => e.textContent.trim());
  const sum = root.querySelector('[data-error-summary]');
  const a = document.activeElement;
  const scroller = [...root.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  return {
    msgs,
    summary: sum ? sum.innerText.replace(/\n+/g, ' | ') : '',
    focus: a ? `${a.tagName}#${a.id}` : '',
    invalid: root.querySelectorAll('[aria-invalid="true"]').length,
    scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
  };
});
const shot = (name) => page.screenshot({ path: `shots/${name}.png` });
const modal = () => page.locator('.fixed.inset-0').last();
const submit = async (re) => { await modal().locator('button[type="submit"]').filter({ hasText: re }).first().click(); await wait(900); };
const fillIn = async (sel, v) => { await modal().locator(sel).fill(String(v)); };
const msgHas = (s, re) => s.msgs.some(m => re.test(m));
const closeModal = async () => { await page.keyboard.press('Escape'); await wait(200); const x = modal().locator('button:has-text("Cancel")').first(); if (await x.count()) await x.click().catch(() => {}); await wait(300); };

async function scenario(name, fn) {
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { check(false, `${name}: script error`, String(e.message).split('\n')[0]); await shot(`error-${name.replace(/\W+/g, '_')}`).catch(() => {}); }
}

// ---------------------------------------------------------------- Add Order
await scenario('Orders: Add Order', async () => {
  await go(page, '/orders');
  await page.getByRole('button', { name: /add order|new order|create order/i }).first().click(); await wait(800);
  // 1. everything empty
  await submit(/save|create|add|place/i);
  let s = await seen();
  console.log('   empty form ->', JSON.stringify(s));
  check(s.msgs.length >= 3, 'empty required fields show a message under each', `${s.msgs.length} messages`);
  check(/Fix .* before saving/.test(s.summary), 'error list near Save', s.summary.slice(0, 120));
  check(/customer|orders-customer-name/i.test(s.focus), 'jumped to the first error and focused it', s.focus);
  await shot('order-empty');
  // 2. lower fields wrong, top fields fine -> the form must scroll down to the first error
  await fillIn('#orders-customer-name', 'TEST Click Check');
  await fillIn('#orders-contact-phone', '12345');
  await fillIn('#orders-contact-email', 'not-an-email');
  await fillIn('#orders-quantity', '2.5');
  await fillIn('#orders-order-value', '0');
  await modal().locator('#orders-order-date').fill('2026-10-05');
  await submit(/save|create|add|place/i);
  s = await seen();
  console.log('   wrong values ->', JSON.stringify(s));
  check(msgHas(s, /mobile/i), 'wrong phone: message under the field', s.msgs.find(m => /mobile/i.test(m)));
  check(msgHas(s, /valid email/i), 'wrong email: message under the field', s.msgs.find(m => /email/i.test(m)));
  check(msgHas(s, /whole number/i), 'decimal quantity: whole numbers only', s.msgs.find(m => /whole/i.test(m)));
  check(msgHas(s, /more than 0/i), 'order value 0: must be more than 0', s.msgs.find(m => /more than 0/i.test(m)));
  check(/phone/i.test(s.focus), 'jump focuses the first wrong field (phone)', s.focus);
  // 3. negative / huge
  await fillIn('#orders-quantity', '-3'); await fillIn('#orders-order-value', '-10');
  await submit(/save|create|add|place/i);
  s = await seen();
  check(msgHas(s, /more than 0/i) && msgHas(s, /negative/i), 'negative quantity and negative value refused', s.msgs.join(' / '));
  await fillIn('#orders-quantity', '100001'); await fillIn('#orders-order-value', '100000001');
  await submit(/save|create|add|place/i);
  s = await seen();
  check(msgHas(s, /1,00,000/) && msgHas(s, /10 crore/), 'over the limits refused (1,00,000 / 10 crore)', s.msgs.join(' / '));
  await shot('order-limits');
  await closeModal();
});

// ---------------------------------------------------------------- Add Lead
await scenario('Leads: Add Lead', async () => {
  await go(page, '/leads');
  await page.getByRole('button', { name: /add lead|new lead/i }).first().click(); await wait(800);
  await submit(/save|create|add/i);
  let s = await seen();
  console.log('   empty form ->', JSON.stringify(s));
  check(msgHas(s, /name is required/i), 'empty name refused', s.msgs.join(' / '));
  check(/Fix .* before saving/.test(s.summary), 'error list near Save', s.summary.slice(0, 120));
  check(/leads-name/.test(s.focus), 'focused the name field', s.focus);
  await fillIn('#leads-name', 'TEST Click Lead');
  await fillIn('#leads-phone', '98765');
  await fillIn('#leads-email', 'bad@');
  await submit(/save|create|add/i);
  s = await seen();
  console.log('   wrong phone/email ->', JSON.stringify(s));
  check(msgHas(s, /mobile/i), 'wrong phone refused', s.msgs.find(m => /mobile/i.test(m)));
  check(msgHas(s, /valid email/i), 'wrong email refused', s.msgs.find(m => /email/i.test(m)));
  const dv = modal().locator('#leads-deal-value');
  if (await dv.count()) {
    await dv.fill('-5'); await submit(/save|create|add/i); s = await seen();
    check(msgHas(s, /negative/i), 'negative deal value refused', s.msgs.join(' / '));
    await dv.fill('100000001'); await submit(/save|create|add/i); s = await seen();
    check(msgHas(s, /10 crore/i), 'deal value over 10 crore refused', s.msgs.join(' / '));
    await dv.fill('0'); await fillIn('#leads-phone', '+91 98765 43210'); await fillIn('#leads-email', ''); await submit(/save|create|add/i);
  }
  await shot('lead-wrong');
  await closeModal();
});

// ---------------------------------------------------------------- Inventory: adjust, count, add batch
await scenario('Inventory: Adjust, Count, Add Batch', async () => {
  await go(page, '/inventory');
  // open the first product's batches
  await page.locator('tbody tr').first().click(); await wait(900);
  const adj = page.locator('button[title*="djust"]').first();
  await adj.click(); await wait(600);
  const a = '#inventory-adjustment-to-add-to-subtract';
  for (const [v, re, what] of [['', /required/i, 'empty'], ['0', /cannot be 0/i, '0'], ['1.5', /whole number/i, 'decimal'], ['100001', /1,00,000/, '+1,00,001'], ['-100001', /1,00,000/, '-1,00,001'], ['-99999', /below 0/i, 'more than the stock']]) {
    await fillIn(a, v); await fillIn('#inventory-reason', 'TEST click check'); await submit(/apply/i);
    const s = await seen();
    check(msgHas(s, re), `Adjust ${what}: message under the field`, s.msgs.join(' / '));
  }
  await fillIn(a, '5'); await fillIn('#inventory-reason', ''); await submit(/apply/i);
  let s = await seen();
  check(msgHas(s, /reason is required/i), 'Adjust: empty reason refused', s.msgs.join(' / '));
  check(/inventory-reason/.test(s.focus), 'Adjust: jumped to the reason field', s.focus);
  await shot('adjust');
  await closeModal();
  // cycle count
  const cnt = page.locator('button[title*="ount"]').first();
  await cnt.click(); await wait(600);
  for (const [v, re, what] of [['2.5', /whole number/i, 'decimal'], ['-1', /negative/i, 'negative'], ['', /required/i, 'empty'], ['100001', /1,00,000/, 'over limit']]) {
    await fillIn('#inventory-physically-counted-quantity', v); await submit(/count|save|apply|record|confirm/i);
    const s2 = await seen();
    check(msgHas(s2, re), `Stock count ${what}: message under the field`, s2.msgs.join(' / '));
  }
  await closeModal();
  // add batch
  await page.getByRole('button', { name: /add batch|add stock|new batch/i }).first().click(); await wait(700);
  await submit(/add batch/i);
  s = await seen();
  console.log('   add batch empty ->', JSON.stringify(s));
  check(msgHas(s, /product is required/i) && msgHas(s, /quantity is required/i) && msgHas(s, /batch number/i), 'Add Batch: product, batch number and quantity required', s.msgs.join(' / '));
  await fillIn('#inventory-quantity', '0'); await fillIn('#inventory-unit-cost', '-4'); await submit(/add batch/i);
  s = await seen();
  check(msgHas(s, /more than 0/i) && msgHas(s, /negative/i), 'Add Batch: quantity 0 and negative cost refused', s.msgs.join(' / '));
  await shot('add-batch');
  await closeModal();
});

// ---------------------------------------------------------------- Partner Record Payment + partner form
for (const [path, label] of [['/dealers', 'Dealers'], ['/distributors', 'Distributors'], ['/retailers', 'Retailers']]) {
  await scenario(`${label}: Record Payment + partner form`, async () => {
    await go(page, path);
    await page.locator('tbody tr').first().click(); await wait(900);
    await page.getByText('+ Record Payment').first().click(); await wait(500);
    const amt = modal().locator('input[id$="-amount"]');
    for (const [v, re, what] of [['', /required/i, 'empty'], ['-5', /negative/i, 'negative'], ['0', /more than 0/i, '0'], ['1.234', /2 decimals/i, '3 decimals'], ['100000001', /10 crore/i, 'over 10 crore']]) {
      await amt.fill(v); await submit(/record payment/i);
      const s = await seen();
      check(msgHas(s, re), `${label} payment ${what}: message under the field`, s.msgs.join(' / '));
    }
    await shot(`payment-${label}`);
    await closeModal();
    await closeModal();
    // Add form
    await page.getByRole('button', { name: /^(add|new|register)/i }).first().click(); await wait(700);
    await submit(/add|save|create|register/i);
    let s = await seen();
    console.log('   empty partner form ->', JSON.stringify(s));
    check(s.msgs.length >= 4 && msgHas(s, /name is required/i), `${label} form: empty required fields show messages (not toasts)`, `${s.msgs.length} messages`);
    check(/Fix .* before saving/.test(s.summary), `${label} form: error list near Save`);
    const first = modal().locator('input[id$="-company-business-name"]');
    await first.fill('TEST Click Partner');
    await modal().locator('input[id$="-phone"]').fill('022-12345678');
    await modal().locator('input[id$="-email"]').fill('nope');
    await submit(/add|save|create|register/i);
    s = await seen();
    check(msgHas(s, /mobile/i), `${label} form: landline refused (mobile only)`, s.msgs.find(m => /mobile/i.test(m)));
    check(msgHas(s, /valid email/i), `${label} form: bad email refused`, s.msgs.find(m => /email/i.test(m)));
    await closeModal();
  });
}

// ---------------------------------------------------------------- Schemes + product
await scenario('Schemes: add form', async () => {
  await go(page, '/schemes');
  await page.getByRole('button', { name: /add|new|create/i }).first().click(); await wait(700);
  await submit(/create|save|add/i);
  let s = await seen();
  check(msgHas(s, /scheme name is required/i), 'empty scheme name shows a message under the field (not a toast)', s.msgs.join(' / '));
  await fillIn('#schemes-scheme-name', 'TEST click scheme');
  for (const [v, re, what] of [['12.345', /2 decimals/i, '3 decimals'], ['150', /between 0 and 100/i, '150'], ['-1', /between 0 and 100/i, '-1']]) {
    await fillIn('#schemes-discount-if-applicable', v); await submit(/create|save|add/i);
    s = await seen();
    check(msgHas(s, re), `Scheme % ${what}: message under the field`, s.msgs.join(' / '));
  }
  await closeModal();
});
await scenario('Products: price form', async () => {
  await go(page, '/masters');
  const tab = page.getByText(/product catalog|products/i).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await wait(500);
  await page.getByRole('button', { name: /add product|new product/i }).first().click(); await wait(600);
  await submit(/add|save|create/i);
  let s = await seen();
  check(msgHas(s, /product name is required/i) && msgHas(s, /base price is required/i), 'product form: required fields show messages', s.msgs.join(' / '));
  await fillIn('#productcatalog-product-name', 'TEST click'); await fillIn('#productcatalog-hsn-code', '3004');
  await fillIn('#productcatalog-mrp-retail-price-limit', '100'); await fillIn('#productcatalog-distributor-base-price', '150');
  await fillIn('#productcatalog-dealer-base-price', '-1'); await fillIn('#productcatalog-retailer-base-price', '1.234');
  await submit(/add|save|create/i);
  s = await seen();
  check(msgHas(s, /above the MRP/i) && msgHas(s, /negative/i) && msgHas(s, /2 decimals/i), 'product form: price above MRP, negative, 3 decimals refused', s.msgs.join(' / '));
  await closeModal();
});

// ---------------------------------------------------------------- Sales return on a delivered order
await scenario('Orders: Sales Return quantity', async () => {
  await go(page, '/orders');
  const btn = page.locator('button[title*="eturn"]').first();
  if (!(await btn.count())) { console.log('   no Return button on the first page of orders'); return; }
  await btn.click(); await wait(1500);
  const q = modal().locator('input[id^="sr-qty-"]').first();
  for (const [v, re, what] of [['', /enter the quantity/i, 'empty'], ['1.5', /whole number/i, 'decimal'], ['0', /more than 0/i, '0'], ['-2', /more than 0/i, 'negative'], ['100001', /1,00,000|can still be returned/i, 'over limit']]) {
    await q.fill(v); await submit(/record return/i);
    const s = await seen();
    check(msgHas(s, re), `Sales return quantity ${what}: message under the field`, s.msgs.join(' / '));
  }
  await shot('sales-return');
  await closeModal();
});

// ---------------------------------------------------------------- SFA beat form (and visit form when a beat exists)
await scenario('SFA: beat form', async () => {
  await go(page, '/sfa?tab=beats');
  await page.getByRole('button', { name: /assign beat/i }).first().click(); await wait(600);
  await modal().locator('input[type="date"]').fill('');
  await submit(/schedule route/i);
  const s = await seen();
  check(s.msgs.length >= 3 && msgHas(s, /outlets to visit is required/i), 'beat form: empty fields show messages', s.msgs.join(' / '));
  await closeModal();
});
await scenario('SFA: visit form', async () => {
  await go(page, '/sfa?tab=beats');
  const log = page.getByRole('button', { name: /log visit|visit|start visit/i }).first();
  if (!(await log.count())) { console.log('   no beat with an outlet to log a visit on today for this user'); return; }
  await log.click(); await wait(800);
  const pick = modal().getByRole('button', { name: /visited$/i }).first();
  console.log('   visit modal text:', (await modal().innerText()).slice(0, 160).replace(/\n+/g, ' | '));
});

// ---------------------------------------------------------------- Sign-up page (no login needed)
await scenario('Sign-up: distributor', async () => {
  await page.goto('http://localhost:5174/register-distributor', { waitUntil: 'domcontentloaded' }); await wait(1500);
  await page.locator('button[type="submit"]').click(); await wait(800);
  let s = await page.evaluate(() => ({ msgs: [...document.querySelectorAll('[data-field-error]')].map(e => e.textContent.trim()), focus: document.activeElement?.id }));
  console.log('   empty ->', JSON.stringify(s));
  check(s.msgs.length >= 6, 'sign-up: empty form shows a message under each field', `${s.msgs.length} messages`);
  await page.fill('#distributorsignup-phone', '12345'); await page.fill('#distributorsignup-email-address', 'bad');
  await page.locator('button[type="submit"]').click(); await wait(800);
  s = await page.evaluate(() => ({ msgs: [...document.querySelectorAll('[data-field-error]')].map(e => e.textContent.trim()) }));
  check(s.msgs.some(m => /mobile/i.test(m)) && s.msgs.some(m => /valid email/i.test(m)), 'sign-up: wrong phone and email refused', s.msgs.join(' / '));
});

console.log(`\nWrite requests attempted (all aborted): ${blocked.filter(b => !/events/.test(b)).length}`, blocked.filter(b => !/events/.test(b)));
console.log(`page problems: ${page.problems.filter(p => !/aborted|ERR_FAILED/.test(p)).slice(0, 6).join(' || ') || 'none'}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(0);
