// S5: TEST Admin rejects the TEST B16 sign-up in the app (removes the login and the record), then the DB is checked.
import { execSync } from 'node:child_process';
import { login, go } from '../phase3/lib.mjs';
const db = (sql) => execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim());
const email = db(`SELECT email FROM distributors WHERE name='TEST B16 Signup Distributor'`)[0];
console.log('TEST registration:', email);
const a = await login('ADMIN'); await go(a, '/distributors'); await a.getByRole('button', { name: 'Pending', exact: true }).click(); await a.waitForTimeout(800); await a.screenshot({ path: 's5.png' });
await a.locator('tr', { hasText: 'TEST B16 Signup Distributor' }).first().locator('button[title="Reject"]').click();
await a.getByRole('button', { name: 'Remove', exact: true }).click();
let gone = false;
for (let i = 0; i < 30 && !gone; i++) { await a.waitForTimeout(1000); gone = db(`SELECT (SELECT count(*) FROM distributors WHERE lower(email)='${email}')+(SELECT count(*) FROM auth.users WHERE lower(email)='${email}')+(SELECT count(*) FROM users WHERE lower(email)='${email}') n`)[0] === '0'; }
console.log(gone ? 'PASS S5 Admin rejected the TEST registration: partner record, profile and login removed' : 'FAIL S5 still present');
await a.context().browser().close();
