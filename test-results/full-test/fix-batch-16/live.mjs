// Batch 16 on the live site, read-only: sign-up fields, Distributor claim form, Distributor/Dealer schemes, Accounts incentives.
import { browser, login, go, BASE } from '../phase3/lib.mjs';
let pass = 0, fail = 0; const check = (ok, w) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${w}`); };
const ctx = await browser.newContext(); const p = await ctx.newPage();
for (const k of ['distributor', 'dealer', 'retailer']) {
  await p.goto(`${BASE}/register-${k}`); await p.waitForTimeout(2500);
  check(await p.locator(`#${k}signup-address`).count() === 1 && await p.locator(`#${k}signup-pincode`).count() === 1, `L1 live /register-${k} asks for address and pincode`);
}
await ctx.close();
const d = await login('DISTRIBUTOR'); await go(d, '/claims');
await d.locator('button', { hasText: 'Submit Claim' }).first().click(); await d.waitForTimeout(1000);
const t = await d.evaluate(() => document.body.innerText);
check(/Earned incentive/i.test(t) && !/-- Select a scheme --/.test(t), 'L2 live claim form asks for an earned incentive, not a scheme');
await go(d, '/schemes'); const s = await d.evaluate(() => document.body.innerText);
check(/TEST P2F Neem 5 pct/.test(s) && !/monsoon mega sale|TEST Distributor Scheme 5pct|TEST B16/.test(s), 'L3 live Distributor sees only the Active distributor scheme');
await d.context().close();
const a = await login('ACCOUNTS'); await go(a, '/incentives');
check((await a.evaluate(() => document.body.innerText)).includes('Incentive'), 'L4 live Incentives screen loads for Accounts');
console.log(`LIVE: ${pass} pass, ${fail} fail`);
await browser.close();
