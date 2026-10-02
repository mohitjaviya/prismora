import { browser, login, go, E } from './glib.mjs';
const p = await login(E.TEST_PURCHASE_MANAGER_EMAIL, E.TEST_PURCHASE_MANAGER_PASSWORD);
await go(p, '/purchases');
await p.waitForFunction(() => /PENDING GRN\s*\n+\s*\d+/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
for (const id of ['TEST-PO-1', 'TEST-PO-PM']) {
  const row = await p.$$eval('tr', (trs, id) => { const r = trs.find(t => t.innerText.startsWith(id)); return r ? { text: r.innerText.replace(/\s+/g, ' '), buttons: [...r.querySelectorAll('button')].map(b => b.innerText.trim() || b.title).filter(Boolean) } : null; }, id);
  console.log(id, JSON.stringify(row));
}
console.log((await p.innerText('body')).match(/PENDING GRN\s*\n+\s*\d+/)[0].replace(/\s+/g, ' '));
await browser.close();
