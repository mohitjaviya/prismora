// React warnings (dev build prints them as console errors/warnings) on the main screens, as Admin and Distributor.
import { login, go, browser } from '../phase3/lib.mjs';
for (const role of ['ADMIN', 'DISTRIBUTOR']) {
  const page = await login(role);
  const seen = new Map();
  page.on('console', m => { const t = m.text(); if (/Warning|Each child|unique "key"|value` prop|uncontrolled|controlled/i.test(t)) seen.set(t.slice(0, 160), (seen.get(t.slice(0, 160)) || 0) + 1); });
  const paths = role === 'ADMIN' ? ['/', '/orders', '/leads', '/accounting', '/purchases', '/inventory', '/distributors', '/reports', '/sfa', '/schemes', '/complaints', '/masters/roles'] : ['/', '/orders', '/ledger', '/schemes', '/incentives', '/claims', '/price-list'];
  for (const p of paths) {
    await go(page, p);
    if (p === '/orders') { const r = page.locator('table tbody tr').first(); if (await r.count()) { await r.click(); await page.waitForTimeout(1500); await page.keyboard.press('Escape'); } }
  }
  console.log(role, seen.size ? [...seen].map(([k, v]) => `${v}x ${k}`).join('\n  ') : 'no React warnings');
  await page.context().close();
}
await browser.close();
