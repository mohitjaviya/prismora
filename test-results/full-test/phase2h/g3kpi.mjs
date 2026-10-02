import { browser, login, go, E } from './glib.mjs';
const p = await login(E.TEST_PURCHASE_MANAGER_EMAIL, E.TEST_PURCHASE_MANAGER_PASSWORD);
await go(p, '/purchases');
await p.waitForFunction(() => /PENDING GRN\s*\n+\s*\d+/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
const t = await p.innerText('body');
console.log((t.match(/TOTAL POS[\s\S]{0,140}/) || ['(KPIs not found) ' + t.slice(0, 300)])[0].replace(/\n+/g, ' | '));
await browser.close();
