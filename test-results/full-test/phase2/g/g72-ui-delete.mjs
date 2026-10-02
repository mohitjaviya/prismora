import { browser, login, go, E } from './glib.mjs';
import { as, asCreds } from 'file:///D:/PRISMORA/test-results/full-test/fix-batch-6/rest-as.mjs';
const out = (id, pass, d) => console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${d}`);
const AD = await as('ADMIN');
const rows = (await AD('users?select=id,email&email=like.test.g72.*')).body; console.log('leftover G72 accounts:', rows.map(r => r.email).join(', '));
const admin = await login(E.TEST_ADMIN_EMAIL, E.TEST_ADMIN_PASSWORD);
await go(admin, '/masters/team');
for (const r of rows) {
  const name = r.email.split('@')[0].replace('test.g72.', '');
  await admin.fill('input[placeholder*="Search name"]', r.email.split('@')[0]); await admin.waitForTimeout(1000);
  await admin.click('button[title="Delete user"]'); await admin.waitForTimeout(1200);
  const btns = await admin.$$eval('[role="dialog"] button, [role="alertdialog"] button, button', bs => bs.filter(b => b.offsetParent).map(b => b.innerText.trim()).filter(Boolean));
  console.log('visible buttons after clicking the bin:', [...new Set(btns)].join(' | '));
  await admin.getByRole('button', { name: 'Delete', exact: true }).last().click(); await admin.waitForTimeout(3500);
  const t = await admin.innerText('body');
  const gone = (await AD(`users?select=id&id=eq.${r.id}`)).body.length === 0; const s = await asCreds(r.email, 'x');
  out(`G72-UI real delete of ${name}`, /was deleted\./.test(t) && gone, `toast=${/was deleted\./.test(t)} row-still-listed=${t.includes(r.email)} profile-gone=${gone}`);
}
await admin.screenshot({ path: 'g72-real-delete2.png' });
await browser.close();
