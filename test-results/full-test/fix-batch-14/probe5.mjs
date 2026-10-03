// Batch 14 probe 5: batch 13 ui.mjs step 1 exactly (fake refusal, DB check, unroute, real save), with
// every fetch timed in the page. Distributor D-TEST-1 contact person is put back through the API.
import { login, go } from '../phase3/lib.mjs';
import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';
const BLOCK = process.env.BLOCK !== '0';
const page = await login('ADMIN');
await page.addInitScript(() => {
  window.__t0 = performance.now(); window.__fx = [];
  const ms = () => Math.round(performance.now() - window.__t0);
  const orig = window.fetch;
  window.fetch = async (input, init = {}) => {
    const e = { m: init.method || 'GET', u: String(typeof input === 'string' ? input : input.url).replace(/^https?:\/\/[^/]+/, '').slice(0, 70), s: ms() };
    window.__fx.push(e);
    try { const r = await orig(input, init); e.e = ms(); e.st = r.status; return r; } catch (err) { e.e = ms(); e.err = String(err).slice(0, 50); throw err; }
  };
});
await go(page, '/distributors');
await page.route(/\/rest\/v1\/distributors(\?|$)/, (route) => ['POST', 'PATCH'].includes(route.request().method())
  ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'probe refusal', details: null, hint: null }) })
  : route.continue());
await page.locator('tr', { hasText: 'TEST Distributor Pvt Ltd' }).locator('button[title="Edit distributor"]').first().click();
await page.fill('#distributors-contact-person', 'TEST B14 Probe');
const btn = page.locator('form button[type="submit"]', { hasText: /Save Changes|Saving/ });
await btn.click();
await page.waitForTimeout(3000);
await page.unrouteAll({ behavior: 'ignoreErrors' });
if (process.env.BLOCK === 'async') await promisify(exec)('node -e "setTimeout(()=>{},8000)"'); else if (BLOCK) execSync('node -e "setTimeout(()=>{},8000)"');
const clickAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
await btn.click();
await page.waitForFunction(() => /Distributor saved|No answer from the server/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
const doneAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
console.log(`BLOCK=${BLOCK} real save: click ${clickAt} → outcome ${doneAt} (${doneAt - clickAt} ms): ${(await page.locator('[role=status]').allInnerTexts()).join(' | ').slice(0, 120)}`);
for (const e of (await page.evaluate(() => window.__fx)).filter(e => (e.e ?? 1e9) >= clickAt - 4000)) console.log(`  ${e.s} → ${e.e ?? '…'} ${e.m} ${e.st ?? e.err ?? ''} ${e.u}`);
await page.context().close(); process.exit(0);
