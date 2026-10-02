import { browser, login, go, E } from './glib.mjs';
import { writeFileSync } from 'node:fs';
const [role, ...paths] = process.argv.slice(2);
const p = await login(E[`TEST_${role}_EMAIL`], E[`TEST_${role}_PASSWORD`]);
for (const path of paths) { await go(p, '/' + path); const t = await p.innerText('body'); writeFileSync(`dump-${role}-${path.replace(/\W/g,'_')}.txt`, t); console.log('==', role, path, t.length); }
await browser.close();
