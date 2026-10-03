// Batch 14 probe: where does a slow save spend its time? Toggles TEST scheme SCH-1790405906612
// Active and back (Admin, local), logging every fetch the page makes (JS call time, response time).
import { login, go } from '../phase3/lib.mjs';
const page = await login('ADMIN');
await page.addInitScript(() => {
  window.__t0 = performance.now(); window.__fx = [];
  const orig = window.fetch;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url; const m = init.method || 'GET';
    const e = { m, u: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90), s: Math.round(performance.now() - window.__t0) };
    window.__fx.push(e);
    try { const r = await orig(input, init); e.e = Math.round(performance.now() - window.__t0); e.st = r.status; return r; }
    catch (err) { e.e = Math.round(performance.now() - window.__t0); e.err = String(err); throw err; }
  };
});
const net = [];
page.on('request', r => net.push({ m: r.method(), u: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90), at: Date.now() }));
const T0 = Date.now();
const card = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last();
await go(page, '/schemes');
console.log('schemes loaded at', Date.now()-T0, 'ms');
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
await page.waitForTimeout(500);
for (const want of ['Active', 'Inactive']) {
  const click = Date.now() - T0;
  await card.locator('button[title="Activate"], button[title="Deactivate"]').first().click();
  await page.waitForFunction((w) => document.body.innerText.includes(`is now ${w}`), want, { timeout: 60000 }).catch(() => {});
  console.log(`toggle → ${want}: click at ${click} ms, toast after ${Date.now() - T0 - click} ms`);
  await page.waitForTimeout(3000);
}
const fx = await page.evaluate(() => window.__fx);
console.log('fetch log (ms since probe start, JS-level):');
for (const e of fx) console.log(`${String(e.s).padStart(6)} → ${String(e.e ?? '…').padStart(6)} (${e.e != null ? e.e - e.s : '?'} ms) ${e.m} ${e.st ?? e.err ?? ''} ${e.u}`);
await page.context().close(); process.exit(0);
