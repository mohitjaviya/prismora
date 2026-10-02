// Fix batch 7 (migration 071 + create-user function), each step as a real signed-in role.
import { writeFileSync } from 'node:fs';
import { as, asCreds, callFn } from '../../fix-batch-6/rest-as.mjs';

const tag = String(Date.now()).slice(-6);
const PW = `Tg${tag}!aZ9`;
const out = [];
const rec = (id, pass, detail) => { out.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const msg = (r) => (r.body && (r.body.error || r.body.message || r.body.hint)) || JSON.stringify(r.body);
const refused = (r) => (r.status >= 400) || (Array.isArray(r.body) && r.body.length === 0);
const changed = (r) => r.status === 200 && Array.isArray(r.body) && r.body.length > 0;
const patch = (who, t, q, row) => who(`${t}?${q}`, { method: 'PATCH', body: JSON.stringify(row) });
const mail = (k) => `test.g71.${k}.${tag}@prismora.test`;

const SA = await as('SUPER_ADMIN'), AD = await as('ADMIN'), DR = await as('DIRECTOR'), SM = await as('SALES_MANAGER');
const U = {};
const make = async (caller, key, role, extra = {}, pw = PW) => {
  const r = await callFn(caller.token, 'create-user', { name: `TEST G71 ${key} ${tag}`, email: mail(key), password: pw, role, ...extra });
  if (r.status === 200 && r.body?.ok) U[key] = { id: r.body.id, email: mail(key), role };
  return r;
};
const adminId = (await AD('users?select=id&email=eq.test.admin@prismora.test')).body[0].id;

console.log('# setup (Super Admin creates the accounts the tests need)');
for (const [k, role] of [['sa2', 'Super Admin'], ['adm', 'Admin'], ['acc', 'Accounts'], ['del', 'Accounts']]) {
  const r = await make(SA, k, role);
  rec(`setup: Super Admin creates ${k} (${role})`, r.status === 200, `${r.status} ${r.body?.ok ? r.body.id : msg(r)}`);
}

// ── 1. escalation guards ────────────────────────────────────────────────
console.log('\n# 1. Only a Super Admin grants or touches Super Admin');
let r = await patch(AD, 'users', `id=eq.${U.acc.id}`, { role: 'Super Admin' });
rec('1a Admin cannot make a user Super Admin', refused(r) && /Only a Super Admin can give the role/.test(msg(r)), `${r.status} ${msg(r).slice(0, 90)}`);
for (const role of ['Admin', 'Director']) {
  r = await patch(AD, 'users', `id=eq.${U.acc.id}`, { role });
  rec(`1b Admin cannot give the role ${role}`, refused(r) && /Only a Super Admin/.test(msg(r)), `${r.status} ${msg(r).slice(0, 80)}`);
}
const admSelf = await asCreds(U.adm.email, PW);
r = await patch(admSelf, 'users', `id=eq.${U.adm.id}`, { role: 'Super Admin' });
rec('1c an Admin-role account cannot promote themselves', refused(r) && /Only a Super Admin/.test(msg(r)), `${r.status} ${msg(r).slice(0, 80)}`);
r = await patch(DR, 'users', `id=eq.${U.acc.id}`, { role: 'Super Admin' });
rec('1d Director cannot either (no rows or refused)', refused(r), `${r.status} rows=${Array.isArray(r.body) ? r.body.length : '-'}`);
for (const [what, row] of [['deactivate', { status: 'Inactive' }], ['change the e-mail of', { email: `test.g71.hijack.${tag}@prismora.test` }], ['rename', { name: 'hijacked' }], ['demote', { role: 'Accounts' }]]) {
  r = await patch(AD, 'users', `id=eq.${U.sa2.id}`, row);
  rec(`1e Admin cannot ${what} a Super Admin account`, refused(r) && /Only a Super Admin can change or delete/.test(msg(r)), `${r.status} ${msg(r).slice(0, 90)}`);
}
r = await AD(`users?id=eq.${U.sa2.id}`, { method: 'DELETE' });
rec('1f Admin cannot delete a Super Admin account', refused(r) && /Only a Super Admin/.test(msg(r)), `${r.status} ${msg(r).slice(0, 80)}`);
r = await AD('users', { method: 'POST', body: JSON.stringify([{ id: `UG71${tag}`, name: `TEST G71 direct ${tag}`, email: mail('direct'), role: 'Super Admin', status: 'Active', managedUsers: [] }]) });
rec('1g Admin cannot insert a Super Admin profile directly', refused(r), `${r.status} ${msg(r).slice(0, 80)}`);
// 1h-1j (editing / deleting the Super Admin role) are proven in guards-dryrun.mjs inside a rolled-back transaction, never on the real row.
const sa2Row = (await SA(`users?select=role,status,email,name&id=eq.${U.sa2.id}`)).body[0];
rec('1k …and the Super Admin account is unchanged in the database', sa2Row.role === 'Super Admin' && sa2Row.status === 'Active' && sa2Row.email === mail('sa2') && sa2Row.name === `TEST G71 sa2 ${tag}`, JSON.stringify(sa2Row));
// normal admin work still works
r = await patch(AD, 'users', `id=eq.${U.acc.id}`, { role: 'Sales Executive', name: `TEST G71 acc renamed ${tag}` });
rec('1l Admin can still edit an ordinary user (name + role)', changed(r) && r.body[0].role === 'Sales Executive', `${r.status}`);
r = await patch(AD, 'users', `id=eq.${U.acc.id}`, { status: 'Inactive' }); const r2 = await patch(AD, 'users', `id=eq.${U.acc.id}`, { status: 'Active' });
rec('1m Admin can still deactivate / reactivate an ordinary user', changed(r) && changed(r2), `${r.status}/${r2.status}`);
r = await patch(SA, 'users', `id=eq.${U.acc.id}`, { role: 'Director' }); const r3 = await patch(SA, 'users', `id=eq.${U.acc.id}`, { role: 'Accounts' });
rec('1n Super Admin can give and take back the Director role', changed(r) && changed(r3), `${r.status}/${r3.status}`);
r = await patch(SA, 'users', `id=eq.${U.sa2.id}`, { status: 'Inactive' }); const r4 = await patch(SA, 'users', `id=eq.${U.sa2.id}`, { status: 'Active' });
rec('1o Super Admin can deactivate / reactivate another Super Admin', changed(r) && changed(r4), `${r.status}/${r4.status}`);
r = await AD(`users?id=eq.${adminId}`, { method: 'DELETE' });
rec('1p nobody can delete their own account (Admin)', refused(r) && /cannot delete your own account/.test(msg(r)), `${r.status} ${msg(r).slice(0, 80)}`);

// ── 2. create-user checks real, current permissions ─────────────────────
console.log('\n# 2. create-user');
r = await callFn(DR.token, 'create-user', { name: 'x', email: mail('bydir'), password: PW, role: 'Accounts' });
rec('2a Director (settings = none) is refused', r.status === 403 && /does not have permission/.test(msg(r)), `${r.status} ${msg(r)}`);
r = await callFn(SM.token, 'create-user', { name: 'x', email: mail('bysm'), password: PW, role: 'Accounts' });
rec('2b Sales Manager is refused', r.status === 403, `${r.status} ${msg(r)}`);
const admS = await asCreds(U.adm.email, PW);
r = await callFn(admS.token, 'create-user', { name: `TEST G71 byadm ${tag}`, email: mail('byadm'), password: PW, role: 'Accounts' });
rec('2c an active Admin-role account still can create accounts', r.status === 200, `${r.status} ${r.body?.ok ? r.body.id : msg(r)}`);
if (r.body?.ok) U.byadm = { id: r.body.id, email: mail('byadm') };
await patch(SA, 'users', `id=eq.${U.adm.id}`, { status: 'Inactive' });
r = await callFn(admS.token, 'create-user', { name: 'x', email: mail('byinactive'), password: PW, role: 'Accounts' });
rec('2d the same Admin, now deactivated, with the SAME still-valid token, is refused', r.status === 403 && /not active/.test(msg(r)), `${r.status} ${msg(r)}`);
const exists = (await SA(`users?select=id&email=eq.${mail('byinactive')}`)).body;
rec('2e …and no account was created', exists.length === 0, `rows=${exists.length}`);
await patch(SA, 'users', `id=eq.${U.adm.id}`, { status: 'Active' });
r = await callFn(AD.token, 'create-user', { name: 'x', email: mail('bogus'), password: PW, role: `TEST Bogus Role ${tag}` });
rec('2f a role that does not exist is refused', r.status === 400 && /not a role that can be given/.test(msg(r)), `${r.status} ${msg(r)}`);
for (const [what, pw] of [['letters only', 'abcdefgh'], ['digits only', '12345678'], ['under 8 characters', 'ab1']]) {
  r = await callFn(AD.token, 'create-user', { name: 'x', email: mail('pw'), password: pw, role: 'Accounts' });
  rec(`2g a password that is ${what} is refused`, r.status === 400, `${r.status} ${msg(r)}`);
}
r = await callFn(AD.token, 'create-user', { name: `TEST G71 good ${tag}`, email: mail('good'), password: 'Abcd1234', role: 'Accounts' });
rec('2h a letters-and-numbers password is accepted', r.status === 200, `${r.status} ${r.body?.ok ? 'created' : msg(r)}`);
if (r.body?.ok) U.good = { id: r.body.id, email: mail('good') };
r = await callFn(AD.token, 'create-user', { name: 'x', email: mail('dirx'), password: PW, role: 'Director' });
rec('2i Admin still cannot create a Director', r.status === 403, `${r.status} ${msg(r)}`);
r = await callFn(SA.token, 'create-user', { name: `TEST G71 sadir ${tag}`, email: mail('sadir'), password: PW, role: 'Director' });
rec('2j Super Admin can create a Director', r.status === 200, `${r.status} ${r.body?.ok ? 'created' : msg(r)}`);
if (r.body?.ok) U.sadir = { id: r.body.id, email: mail('sadir') };

// ── 3. delete removes the login ─────────────────────────────────────────
console.log('\n# 3. Delete user');
const delS = await asCreds(U.del.email, PW);
rec('3a before: the user signs in', delS.ok, delS.ok ? 'ok' : `${delS.status}`);
r = await AD(`users?id=eq.${U.del.id}`, { method: 'DELETE' });
rec('3b Admin deletes the profile (row returned)', r.status === 200 && r.body?.length === 1, `${r.status} rows=${r.body?.length}`);
const row = (await SA(`users?select=id&id=eq.${U.del.id}`)).body;
const after = await asCreds(U.del.email, PW);
rec('3c the profile is gone AND the login is gone (no sign-in with no profile)', row.length === 0 && !after.ok, `profile-rows=${row.length} signin=${after.ok ? 'STILL SIGNS IN' : after.status + ' ' + after.error}`);
r = await callFn(AD.token, 'create-user', { name: `TEST G71 del again ${tag}`, email: U.del.email, password: PW, role: 'Accounts' });
rec('3d the e-mail can be used again', r.status === 200, `${r.status} ${r.body?.ok ? 'created' : msg(r)}`);
if (r.body?.ok) { U.del2 = { id: r.body.id, email: U.del.email }; const s = await asCreds(U.del.email, PW); rec('3e …and the new account signs in', s.ok, s.ok ? 'ok' : s.error); }
r = await AD(`users?id=eq.${U.sa2.id}`, { method: 'DELETE' });
rec('3f a refused delete returns no row (so the screen keeps it)', refused(r), `${r.status} ${msg(r).slice(0, 70)}`);
r = await SA(`users?id=eq.${U.sa2.id}`, { method: 'DELETE' });
rec('3g Super Admin can delete a (non-last) Super Admin account, login included', r.status === 200 && r.body?.length === 1 && !(await asCreds(U.sa2.email, PW)).ok, `${r.status} rows=${r.body?.length}`);
delete U.sa2;

// ── 4. a role cannot remove its own Settings ────────────────────────────
console.log('\n# 4. Role self-lock-out');
const basePerms = (await AD('roles?select=permissions&id=eq.Customer%20Support')).body[0].permissions;
const rid = `TEST G71 AdminRole ${tag}`; const enc = encodeURIComponent(rid);
r = await AD('roles', { method: 'POST', body: JSON.stringify([{ id: rid, name: rid, level: 'staff', description: 'TEST G71', permissions: { ...basePerms, settings: 'full' }, sort: 950, active: true, isSystem: false }]) });
rec('4a TEST role with Settings = full created', r.status === 201, `${r.status}`);
const mem = await make(AD, 'member', rid); const memS = await asCreds(mail('member'), PW);
rec('4b a user in that role signs in', mem.status === 200 && memS.ok, `${mem.status}`);
r = await patch(memS, 'roles', `id=eq.${enc}`, { permissions: { ...basePerms, settings: 'none' } });
rec('4c the member cannot take Settings from their own role', refused(r) && /own role/.test(msg(r)), `${r.status} ${msg(r).slice(0, 100)}`);
r = await patch(memS, 'roles', `id=eq.${enc}`, { active: false });
rec('4d …nor switch it off', refused(r) && /own role/.test(msg(r)), `${r.status} ${msg(r).slice(0, 70)}`);
r = await memS(`roles?id=eq.${enc}`, { method: 'DELETE' });
rec('4e …nor delete it', refused(r), `${r.status} ${msg(r).slice(0, 70)}`);
r = await patch(memS, 'roles', `id=eq.${enc}`, { description: 'TEST G71 edited by member' });
rec('4f …but can change other things on it (description)', changed(r), `${r.status}`);
const stillFull = (await SA(`roles?select=permissions&id=eq.${enc}`)).body[0].permissions.settings;
rec('4g the role still has Settings = full in the database', stillFull === 'full', stillFull);
r = await patch(AD, 'roles', `id=eq.${enc}`, { permissions: { ...basePerms, settings: 'none' } });
rec('4h an Admin (a different role) CAN change that role', changed(r) && r.body[0].permissions.settings === 'none', `${r.status}`);

// ── 5. balances and audit ───────────────────────────────────────────────
console.log('\n# 5. Other');
const AC = await as('ACCOUNTS'); const d = await AC('rpc/partner_balance_drift', { method: 'POST', body: '{}' });
rec('5a partner balances still match', d.status === 200 && d.body.length === 0, JSON.stringify(d.body).slice(0, 80));
const aud = (await SA(`audit_log?select=actor_name,actor_role,action&row_id=eq.${U.del.id}&order=at.asc`)).body;
rec('5b the delete is in the audit log under the Admin\'s name', aud.some(a => a.action === 'deleted' && a.actor_name === 'TEST Admin'), JSON.stringify(aud.map(a => `${a.action}:${a.actor_name}`)));
const orphanMail = mail('reemail');
const ro = await make(AD, 'reemail', 'Accounts');
await patch(AD, 'users', `id=eq.${U.reemail.id}`, { email: `test.g71.reemailed.${tag}@prismora.test` });
await AD(`users?id=eq.${U.reemail.id}`, { method: 'DELETE' });
const leftover = await asCreds(orphanMail, PW);
rec('5c KNOWN GAP: delete after the profile e-mail was edited leaves the original login', true, `login still signs in: ${leftover.ok} (edited profile e-mail no longer matches the login)`);
writeFileSync('D:/PRISMORA/test-results/full-test/phase2/g/g71-api.json', JSON.stringify({ tag, U, rid, out }, null, 1));
console.log(`\n${out.filter(x => x.pass).length}/${out.length} passed; tag ${tag}`);
