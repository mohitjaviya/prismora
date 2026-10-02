import { browser, login, go, E } from './glib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const p = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
for (const [path, btn, name] of [['/orders', 'Export', 'orders'], ['/schemes', 'Export', 'schemes'], ['/purchases', 'Export', 'purchases']]) {
  await go(p, path);
  if (name === 'schemes') console.log('schemes screen:', (await p.innerText('main')).replace(/\n+/g, '|').slice(0, 600));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 6000 }).catch(() => null), p.click(`button:has-text("${btn}")`).catch(() => {})]);
  if (dl) { writeFileSync(`raw-${name}.csv`, readFileSync(await dl.path(), 'utf8')); console.log('saved', name); }
}
await browser.close();
