// Dumps the visible text of KPI screens, per role, for comparison with SQL.
import { browser, login, go, E, settle } from './glib.mjs';
import { writeFileSync } from 'node:fs';
const flat = (t) => t.replace(/\n+/g, '|');
const out = {};
const sa = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
for (const path of ['/incentives', '/claims', '/purchases']) { await go(sa, path); out['SA ' + path] = flat(await sa.innerText('main').catch(() => sa.innerText('body'))).slice(0, 1500); }
// Partner dashboards: open the app root (the dashboard) after sign-in, no reload
for (const role of ['DISTRIBUTOR', 'DISTRIBUTOR_2', 'DEALER', 'RETAILER', 'P2E_DIST']) {
  const p = await login(E[`TEST_${role}_EMAIL`], E[`TEST_${role}_PASSWORD`]);
  await settle(p);
  out[role + ' home'] = flat(await p.innerText('body')).slice(0, 1500);
  for (const path of ['/incentives', '/stock']) { await go(p, path); out[role + ' ' + path] = flat(await p.innerText('body')).slice(0, 1200); }
  await p.context().close();
}
writeFileSync('kpis.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log('== ' + k + '\n' + v.slice(0, 900));
await browser.close();
