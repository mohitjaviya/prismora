// RISK-CACHE follow-up (read-only): after tab B signs out and in as another user, what do both tabs show?
import { login, settle, BASE, E } from '../phase3/lib.mjs';
const tabA = await login('ADMIN'); const ctx = tabA.context();
await tabA.goto(BASE + '/accounting', { waitUntil: 'domcontentloaded' }); await settle(tabA);
const tabB = await ctx.newPage(); await tabB.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await settle(tabB);
await tabB.locator('div.relative.ml-2 > button').first().click(); await tabB.getByText('Sign Out', { exact: true }).click();
await tabB.waitForURL(/\/login/); await tabB.waitForTimeout(1500);
console.log('after B sign-out: A url', tabA.url());
await tabB.fill('input[type="email"], input[name="email"], input[type="text"]', E.TEST_SALES_EXEC_1_EMAIL);
await tabB.fill('input[type="password"]', E.TEST_SALES_EXEC_1_PASSWORD); await tabB.click('button[type="submit"]');
await tabB.waitForTimeout(6000); await settle(tabB);
const who = (p) => p.evaluate(() => { const k = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k)); try { return JSON.parse(localStorage.getItem(k))?.user?.email || 'no token'; } catch { return 'no token'; } });
console.log('B url', tabB.url(), '| token user', await who(tabB));
await tabA.waitForTimeout(5000); console.log('A (no reload) url', tabA.url());
await tabA.reload({ waitUntil: 'domcontentloaded' }); await tabA.waitForTimeout(6000); await settle(tabA);
console.log('A after reload url', tabA.url(), '| token user', await who(tabA));
await tabB.reload({ waitUntil: 'domcontentloaded' }); await tabB.waitForTimeout(6000);
console.log('B after reload url', tabB.url(), '| token user', await who(tabB));
await ctx.browser().close();
