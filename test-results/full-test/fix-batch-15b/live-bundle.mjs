// Read-only: which live JS files /inventory loads, and whether they contain the 081 Edit-form move.
import { login, go } from '../phase3/lib.mjs';
const page = await login('WAREHOUSE');
const hits = [];
page.on('response', async r => { if (r.url().endsWith('.js')) { try { const t = await r.text(); if (t.includes('moved on the batch Edit form')) hits.push(r.url().split('/').pop()); } catch {} } });
await go(page, '/inventory');
await page.waitForTimeout(3000);
console.log('live chunk with the 081 Edit-form move:', hits.length ? hits.join(', ') : 'NOT FOUND');
await page.context().browser().close();
