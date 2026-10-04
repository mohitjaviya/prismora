// C4-C6: TEST Accounts settles the TEST B16 claim on the Claims screen; the DB shows the incentive paid once.
import { execSync } from 'node:child_process';
import { login, go } from '../phase3/lib.mjs';
const db = (sql) => execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim());
const one = (s) => db(s)[0];
let pass = 0, fail = 0; const check = (ok, w) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${w}`); };
const claim = one(`SELECT id||' '||"incentiveId" FROM scheme_claims WHERE "schemeName"='TEST B16 10pct Balm'`).split(' ');
const ac = await login('ACCOUNTS'); await go(ac, '/claims');
await ac.locator('tr', { hasText: 'TEST B16 10pct Balm' }).first().locator('button', { hasText: 'Review' }).click(); await ac.waitForTimeout(600);
await ac.getByRole('button', { name: 'Settle', exact: true }).click();
let msg = false; for (let i = 0; i < 15 && !msg; i++) { await ac.waitForTimeout(1000); msg = /settled: its incentive is paid/.test(await ac.evaluate(() => document.body.innerText)); }
check(msg, 'C4 Accounts settles: "its incentive is paid"');
const exp = one(`SELECT category||' '||amount FROM expenses WHERE id='EXP-${claim[1]}'`);
check(one(`SELECT status FROM scheme_claims WHERE id='${claim[0]}'`) === 'Settled' && one(`SELECT status FROM distributor_incentives WHERE id='${claim[1]}'`) === 'Paid' && exp === 'Scheme Claim 30',
  `C5 DB: claim ${claim[0]} Settled, incentive Paid, one expense: ${exp}; expenses for this claim/incentive: ${db(`SELECT id FROM expenses WHERE id IN ('EXP-${claim[1]}','EXP-${claim[0]}')`).join(', ')}`);
await go(ac, '/claims');
check(await ac.locator('tr', { hasText: 'TEST B16 10pct Balm' }).first().locator('button', { hasText: 'Review' }).count() === 0, 'C6 a settled claim offers no Review (final)');
console.log(`C: ${pass} pass, ${fail} fail`);
await ac.context().browser().close();
