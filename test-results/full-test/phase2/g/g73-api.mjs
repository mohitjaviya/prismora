// Migration 073: e-mail locked. As Admin and as Super Admin: old login keeps working, new account works,
// deactivate / delete of the old one behaves, and the old login is removed on delete.
import { writeFileSync } from 'node:fs';
import { as, asCreds, callFn } from '../../fix-batch-6/rest-as.mjs';

const tag = String(Date.now()).slice(-6), PW = `Tg${tag}!aZ9`;
const out = [];
const rec = (id, pass, detail) => { out.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const msg = (r) => (r.body && (r.body.error || r.body.message)) || JSON.stringify(r.body);
const patch = (who, q, row) => who(`users?${q}`, { method: 'PATCH', body: JSON.stringify(row) });

for (const [label, role] of [['Admin', 'ADMIN'], ['Super Admin', 'SUPER_ADMIN']]) {
  console.log(`\n# as ${label}`);
  const W = await as(role); const k = label.replace(' ', '').toLowerCase();
  const oldMail = `test.g73.old.${k}.${tag}@prismora.test`, newMail = `test.g73.new.${k}.${tag}@prismora.test`;
  const c = await callFn(W.token, 'create-user', { name: `TEST G73 old ${k} ${tag}`, email: oldMail, password: PW, role: 'Accounts' });
  rec(`${label}: creates the account`, c.status === 200, `${c.status}`);
  const id = c.body.id;
  const oldS = await asCreds(oldMail, PW);
  let r = await patch(W, `id=eq.${id}`, { email: newMail });
  rec(`${label}: changing the e-mail is refused with a clear message`, r.status === 403 && /e-mail cannot be changed/.test(msg(r)), `${r.status} ${msg(r).slice(0, 90)}`);
  r = await patch(W, `id=eq.${id}`, { email: oldMail.toUpperCase() });
  rec(`${label}: …even if only the letter case changes`, r.status === 403, `${r.status}`);
  const row = (await W(`users?select=email&id=eq.${id}`)).body[0];
  rec(`${label}: the e-mail in the database is unchanged`, row.email === oldMail, row.email);
  const still = (await oldS(`users?select=id,role&email=eq.${oldMail}`)).body;
  rec(`${label}: the OLD login still works and sees its own profile (not locked out)`, oldS.ok && still?.length === 1 && still[0].id === id, `signin=${oldS.ok} profile-rows=${still?.length}`);
  r = await patch(W, `id=eq.${id}`, { name: `TEST G73 renamed ${k} ${tag}` });
  rec(`${label}: other edits still work (name)`, r.status === 200 && r.body?.length === 1, `${r.status}`);
  // the supported way to "change" an e-mail: a new account, then retire the old one
  const n = await callFn(W.token, 'create-user', { name: `TEST G73 new ${k} ${tag}`, email: newMail, password: PW, role: 'Accounts' });
  const newS = await asCreds(newMail, PW);
  rec(`${label}: a NEW account for the new e-mail is created and signs in`, n.status === 200 && newS.ok, `${n.status} signin=${newS.ok}`);
  r = await patch(W, `id=eq.${id}`, { status: 'Inactive' });
  const oldRead = await oldS('orders?select=id&limit=2');
  rec(`${label}: deactivating the old account cuts it off at once`, r.status === 200 && (oldRead.status >= 400 || oldRead.body.length === 0), `${r.status} old rows=${oldRead.body?.length}`);
  const newRead = await newS('orders?select=id&limit=2');
  rec(`${label}: the new account is unaffected`, newRead.status === 200, `${newRead.status} rows=${newRead.body?.length}`);
  r = await W(`users?id=eq.${id}`, { method: 'DELETE' });
  const gone = await asCreds(oldMail, PW);
  rec(`${label}: deleting the old account removes profile AND login`, r.status === 200 && r.body?.length === 1 && !gone.ok, `${r.status} old signin=${gone.ok ? 'STILL SIGNS IN' : 'refused'}`);
  const newStill = await asCreds(newMail, PW);
  rec(`${label}: the new account still signs in after the old one is deleted`, newStill.ok, `signin=${newStill.ok}`);
  const reuse = await callFn(W.token, 'create-user', { name: `TEST G73 reuse ${k} ${tag}`, email: oldMail, password: PW, role: 'Accounts' });
  rec(`${label}: the old e-mail can be used again`, reuse.status === 200, `${reuse.status}`);
}
const AC = await as('ACCOUNTS'); const d = await AC('rpc/partner_balance_drift', { method: 'POST', body: '{}' });
rec('partner balances still match', d.status === 200 && d.body.length === 0, JSON.stringify(d.body).slice(0, 60));
writeFileSync('D:/PRISMORA/test-results/full-test/phase2/g/g73-api.json', JSON.stringify({ tag, out }, null, 1));
console.log(`\n${out.filter(x => x.pass).length}/${out.length} passed; tag ${tag}`);
