// Batch 14 probe 4: after Playwright answers a write itself (route.fulfill, a fake refusal) and the
// route is removed, is the next real write slow? E: fulfill then unrouteAll; F: continue then unrouteAll.
import { login, go } from '../phase3/lib.mjs';
for (const mode of (process.env.MODES || 'E,F').split(',')) {
  const page = await login('ADMIN');
  await go(page, '/schemes');
  await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const tgl = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last().locator('button[title="Activate"], button[title="Deactivate"]').first();
  await page.route(/\/rest\/v1\/schemes/, (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return mode === 'E' ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'probe refusal' }) }) : route.abort();
  });
  await tgl.click(); await page.waitForTimeout(2500);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.waitForTimeout(1000);
  for (const want of ['Active', 'Inactive']) {
    const t0 = Date.now();
    await tgl.click();
    await page.waitForFunction((w) => document.body.innerText.includes(`is now ${w}`) || document.body.innerText.includes('No answer from the server'), want, { timeout: 40000 }).catch(() => {});
    const log = await page.evaluate(() => (window.__prismoraWriteLog || []).filter(e => e.end).pop());
    console.log(JSON.stringify({ mode, want, wall: Date.now() - t0, journal: log }));
    await page.waitForTimeout(3000);
  }
  await page.context().close();
}
process.exit(0);
