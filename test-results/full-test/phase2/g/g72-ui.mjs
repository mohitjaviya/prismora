import { browser, login, go, E, BASE } from './glib.mjs';
import { as, asCreds, callFn } from 'file:///D:/PRISMORA/test-results/full-test/fix-batch-6/rest-as.mjs';
const out = (id, pass, d) => console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${d}`);
const tag = String(Date.now()).slice(-6), PW = `Tg${tag}!aZ9`;
const AD = await as('ADMIN');
const mk = async (k) => (await callFn(AD.token, 'create-user', { name: `TEST G72 ${k} ${tag}`, email: `test.g72.${k}.${tag}@prismora.test`, password: PW, role: 'Accounts' })).body;
const delA = await mk('delete'), keepB = await mk('refuse');
const admin = await login(E.TEST_ADMIN_EMAIL, E.TEST_ADMIN_PASSWORD);
await go(admin, '/masters/team');
await admin.click('button:has-text("Add User")');
const adminOpts = await admin.$$eval('#teammembers-role option', o => o.map(x => x.value));
out('G72-UI Add User as Admin: no Super Admin / Director offered', !adminOpts.includes('Super Admin') && !adminOpts.includes('Director') && adminOpts.includes('Sales Manager'), adminOpts.join(', '));
await admin.keyboard.press('Escape'); await admin.click('button:has-text("Cancel")').catch(() => {});
// Super Admin row: no controls for an Admin
await admin.fill('input[placeholder*="Search name"]', 'TEST Super Admin'); await admin.waitForTimeout(800);
const saRowButtons = await admin.$$eval('tr', trs => { const r = trs.find(t => /test\.super\.admin@/.test(t.innerText)); return r ? [...r.querySelectorAll('button')].map(b => b.title).filter(Boolean) : null; });
out('G72-UI Admin sees the Super Admin row with NO edit / deactivate / delete buttons', Array.isArray(saRowButtons) && saRowButtons.length === 0, `buttons=${JSON.stringify(saRowButtons)}`);
await admin.fill('input[placeholder*="Search name"]', `TEST G72 delete ${tag}`); await admin.waitForTimeout(800);
const dirRow = await admin.$$eval('tr', trs => !!trs.find(t => /Director/.test(t.innerText)));
// Super Admin view of the form
const sa = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
await go(sa, '/masters/team'); await sa.click('button:has-text("Add User")');
const saOpts = await sa.$$eval('#teammembers-role option', o => o.map(x => x.value));
out('G72-UI Add User as Super Admin: Super Admin and Director are offered', saOpts.includes('Super Admin') && saOpts.includes('Director'), saOpts.join(', '));
// refused delete: force the database call to fail; the row must stay and the reason must show
await admin.fill('input[placeholder*="Search name"]', `TEST G72 refuse ${tag}`); await admin.waitForTimeout(800);
await admin.route('**/rest/v1/users?id=eq.*', async (route) => { if (route.request().method() === 'DELETE') await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'FORCED REFUSAL FOR TEST' }) }); else await route.continue(); });
await admin.click('button[title="Delete user"]'); await admin.waitForTimeout(600);
await admin.click('button:has-text("Delete")'); await admin.waitForTimeout(3000);
let t = await admin.innerText('body');
out('G72-UI a refused delete: message shown AND the row stays on screen', /was not deleted: FORCED REFUSAL FOR TEST/.test(t) && t.includes(`TEST G72 refuse ${tag}`), `toast=${/was not deleted: FORCED REFUSAL/.test(t)} row-still-listed=${t.includes(`TEST G72 refuse ${tag}`)}`);
await admin.screenshot({ path: 'g72-refused-delete.png' });
const stillThere = (await AD(`users?select=id&id=eq.${keepB.id}`)).body.length;
out('G72-DB …and the user is still in the database', stillThere === 1, `rows=${stillThere}`);
await admin.unroute('**/rest/v1/users?id=eq.*');
// real delete through the screen
await admin.fill('input[placeholder*="Search name"]', `TEST G72 delete ${tag}`); await admin.waitForTimeout(800);
await admin.click('button[title="Delete user"]'); await admin.waitForTimeout(600);
await admin.click('button:has-text("Delete")'); await admin.waitForTimeout(3500);
t = await admin.innerText('body');
out('G72-UI a real delete: success message and the row is gone', /was deleted\./.test(t) && !t.includes(`test.g72.delete.${tag}@`), `toast=${/was deleted\./.test(t)} row-gone=${!t.includes(`test.g72.delete.${tag}@`)}`);
await admin.screenshot({ path: 'g72-real-delete.png' });
const gone = (await AD(`users?select=id&id=eq.${delA.id}`)).body.length; const login2 = await asCreds(`test.g72.delete.${tag}@prismora.test`, PW);
out('G72-DB …profile gone and the login gone (cannot sign in)', gone === 0 && !login2.ok, `profile-rows=${gone} signin=${login2.ok ? 'STILL SIGNS IN' : login2.error}`);
// remove the second test account through the screen too
await admin.fill('input[placeholder*="Search name"]', `TEST G72 refuse ${tag}`); await admin.waitForTimeout(800);
await admin.click('button[title="Delete user"]'); await admin.waitForTimeout(600); await admin.click('button:has-text("Delete")'); await admin.waitForTimeout(3000);
out('G72-DB cleanup: second TEST account removed through the screen', (await AD(`users?select=id&id=eq.${keepB.id}`)).body.length === 0, 'ok');
await browser.close();
