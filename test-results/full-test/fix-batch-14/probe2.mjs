// Batch 14 probe 2: catch a slow save in the act. Fresh Admin session each round (as the
// test scripts do), then toggles TEST scheme SCH-1790405906612 Active and back, twice.
// Per save: click -> fetch called (JS) -> response -> toast; plus every wait for a Web Lock
// (supabase-js auth lock). No request interception. Usage: ROUNDS=4 node probe2.mjs
import { login, go } from '../phase3/lib.mjs';
const ROUNDS = Number(process.env.ROUNDS || 4);
const hook = () => {
  window.__t0 = performance.now(); window.__fx = []; window.__lk = [];
  const ms = () => Math.round(performance.now() - window.__t0);
  const orig = window.fetch;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const e = { m: init.method || 'GET', u: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80), s: ms() };
    window.__fx.push(e);
    try { const r = await orig(input, init); e.e = ms(); e.st = r.status; return r; }
    catch (err) { e.e = ms(); e.err = String(err).slice(0, 60); throw err; }
  };
  if (navigator.locks) {
    const req = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = (name, ...rest) => {
      const cb = rest[rest.length - 1]; const asked = ms();
      return req(name, ...rest.slice(0, -1), async (l) => {
        const got = ms(); const r = { name: String(name).slice(0, 40), asked, got };
        window.__lk.push(r);
        try { return await cb(l); } finally { r.done = ms(); }
      });
    };
  }
};
const T = [];
for (let round = 1; round <= ROUNDS; round++) {
  const page = await login('ADMIN');
  await page.addInitScript(hook);
  await go(page, '/schemes');
  await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const card = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last();
  for (const want of ['Active', 'Inactive', 'Active', 'Inactive']) {
    const clickAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    await card.locator('button[title="Activate"], button[title="Deactivate"]').first().click();
    await page.waitForFunction((w) => document.body.innerText.includes(`is now ${w}`), want, { timeout: 90000 }).catch(() => {});
    const toastAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    await page.waitForTimeout(200);
    const f = (await page.evaluate(() => window.__fx)).filter(e => e.m === 'PATCH' && e.s >= 0).pop();
    const row = { round, want, sinceLoad: clickAt, total: toastAt - clickAt, beforeFetch: f ? f.s - clickAt : null, fetch: f ? f.e - f.s : null, afterFetch: f ? toastAt - f.e : null };
    T.push(row); console.log(JSON.stringify(row));
    // Slow one: show what else was going on.
    if (row.total > 3000) {
      const fx = await page.evaluate(() => window.__fx);
      const lk = await page.evaluate(() => window.__lk);
      for (const e of fx.filter(e => (e.e ?? 1e9) > clickAt - 500 && e.s < toastAt)) console.log(`   fetch ${e.s}→${e.e ?? '…'} ${e.m} ${e.st ?? e.err ?? ''} ${e.u}`);
      for (const l of lk.filter(l => (l.done ?? 1e9) > clickAt - 500 && l.asked < toastAt)) console.log(`   lock ${l.name} asked ${l.asked} got ${l.got} done ${l.done ?? '…'}`);
    }
    await page.waitForTimeout(1500);
  }
  await page.context().close();
}
const tot = T.map(r => r.total).sort((a, b) => a - b);
console.log(`saves=${T.length} median=${tot[tot.length >> 1]} ms max=${tot[tot.length - 1]} ms slow(>3s)=${T.filter(r => r.total > 3000).length}`);
process.exit(0);
