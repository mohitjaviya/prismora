// How many times the data layer loads: counts GET /rest/v1/orders (one per full load) on sign-in and on reload.
// Read-only. BASE=https://prismora-henna.vercel.app for live.
import { login, browser, BASE } from '../phase3/lib.mjs';
const role = process.argv[2] || 'ADMIN';
const page = await login(role);   // waits 6 s after submit
let n = 0; const log = [];
page.on('request', r => { if (r.method() === 'GET' && /\/rest\/v1\/orders\?/.test(r.url())) { n++; log.push(new Date().toISOString().slice(11, 23)); } });
page.on('console', m => { if (/\[load-probe\]/.test(m.text())) log.push(m.text()); });
const count = async (label, fn) => { n = 0; log.length = 0; await fn(); await page.waitForTimeout(9000); console.log(`${label}: ${n} orders fetches`, log.join(' | ')); };
await count('reload while signed in', () => page.reload({ waitUntil: 'domcontentloaded' }));
await count('navigate to /orders (SPA)', () => page.click('a[href="/orders"]').catch(() => page.goto(BASE + '/orders')));
// Fresh sign-in: sign out by clearing storage, then log in again in this page.
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await count('fresh sign-in', async () => {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  const { E } = await import('../phase3/lib.mjs');
  await page.fill('input[type="email"], input[name="email"], input[type="text"]', E[`TEST_${role}_EMAIL`]);
  await page.fill('input[type="password"]', E[`TEST_${role}_PASSWORD`]);
  await page.click('button[type="submit"]');
});
await browser.close();
