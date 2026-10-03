// Batch 14 probe 3: is the slow save made by the test harness? Same real scheme toggle as probe2,
// under three conditions: A plain; B request interception was on and has been removed (as in
// the batch 13 scripts: refuse, unrouteAll, then the real save); C interception on during the save.
// In B and C, Node is blocked by a synchronous 8 s child process right after the click, as the
// scripts' db() check does.
import { login, go } from '../phase3/lib.mjs';
import { execSync } from 'node:child_process';
const blockNode = () => execSync('node -e "setTimeout(()=>{},8000)"');
const results = [];
for (const mode of (process.env.MODES || 'A,B,C').split(',')) {
  const page = await login('ADMIN');
  await go(page, '/schemes');
  await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const card = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last();
  if (mode === 'B' || mode === 'C') await page.route(/\/rest\/v1\//, (route) => route.continue());
  if (mode === 'B') { await page.waitForTimeout(500); await page.unrouteAll({ behavior: 'ignoreErrors' }); }
  for (const want of ['Active', 'Inactive']) {
    const t0 = Date.now();
    await card.locator('button[title="Activate"], button[title="Deactivate"]').first().click();
    if (mode !== 'A') blockNode();
    await page.waitForFunction((w) => document.body.innerText.includes(`is now ${w}`), want, { timeout: 90000 }).catch(() => {});
    // The page's own measure of the save (start -> end in the write journal).
    const ms = await page.evaluate(() => (window.__prismoraWriteLog || []).filter(e => e.end).pop()?.ms);
    results.push({ mode, want, journalMs: ms, wall: Date.now() - t0 });
    console.log(JSON.stringify(results[results.length - 1]));
    await page.waitForTimeout(1500);
  }
  await page.context().close();
}
process.exit(0);
