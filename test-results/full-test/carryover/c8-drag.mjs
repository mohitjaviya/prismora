// C8 lead drag refusal (report only). TEST Sales Exec 1 drags TEST lead L16 from "Lead Created" to "Call" on the board
// (keyboard drag: Space, ArrowRight, Space). The save is intercepted and answered with a database refusal, so nothing
// reaches the DB. Expected: a refusal message, and the card back in "Lead Created". Then one real-looking success
// path is NOT run (it would change L16). DB checked only after interception is off.
import { execSync } from 'node:child_process';
import { login, go, assertNotIntercepting } from '../phase3/lib.mjs';
const db = (sql) => { assertNotIntercepting(); return execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim()); };
const before = db(`SELECT status FROM leads WHERE id='L16'`)[0];
const p = await login('SALES_EXEC_1'); await go(p, '/leads');
await p.locator('button[title="Board view"]').click(); await p.waitForTimeout(1000);
const column = async () => p.evaluate(() => { const c = document.getElementById('lead-board-L16'); return c?.closest('.glass-panel')?.querySelector('h3')?.textContent || null; });
console.log('L16 column before:', await column(), '| DB:', before);
let patched = 0;
await p.route('**/rest/v1/leads**', r => { if (r.request().method() === 'PATCH') { patched++; return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'TEST C8 refusal: this lead cannot move now.' }) }); } return r.continue(); });
const card = p.locator('#lead-board-L16');
await card.focus(); await p.keyboard.press('Space'); await p.waitForTimeout(400);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
await p.keyboard.press('Space'); await p.waitForTimeout(800);
const during = await column();
let msg = null;
for (let i = 0; i < 20 && !msg; i++) { await p.waitForTimeout(500); msg = (await p.evaluate(() => document.body.innerText)).match(/[^\n]*TEST C8 refusal[^\n]*/)?.[0] || null; }
await p.waitForTimeout(1000);
const afterCol = await column();
await p.unrouteAll();
const afterDb = db(`SELECT status FROM leads WHERE id='L16'`)[0];
console.log(`save requests intercepted: ${patched}; column right after drop: ${during}; message: ${msg || 'NONE'}; column after refusal: ${afterCol}; DB status: ${afterDb}`);
console.log(patched > 0 && msg && afterCol === 'Lead Created' && afterDb === before ? 'PASS C8 refusal shown, card back in Lead Created, DB unchanged' : 'FAIL C8 see above');
await p.context().browser().close();
