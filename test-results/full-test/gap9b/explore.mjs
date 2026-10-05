import { login, go } from '../phase3/lib.mjs';
const page = await login('SUPER_ADMIN');
await go(page, '/orders');
await page.getByRole('button', { name: /add order|new order|create order/i }).first().click();
await page.waitForTimeout(800);
const info = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 form input, .fixed.inset-0 form select, .fixed.inset-0 form textarea')].map(e => `${e.tagName}#${e.id}[${e.type}] v=${e.value}`));
console.log(info.join('\n'));
console.log(await page.evaluate(() => document.body.innerText.slice(0, 300)));
process.exit(0);
