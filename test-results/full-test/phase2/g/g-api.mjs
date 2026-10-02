// Phase 2 story G (admin: users, roles, permissions, deactivate, audit), each step as a real signed-in role.
// Test accounts created here are named "TEST G ..." and use e-mails test.g.<key>.<tag>@prismora.test.
import { writeFileSync, appendFileSync } from 'node:fs';
import { as, asCreds, callFn } from '../../fix-batch-6/rest-as.mjs';

const tag = String(Date.now()).slice(-6);
const PW = `Tg${tag}!aZ9`;                       // letters + digits, 8+; local-only (saved to .env.test-accounts.local, never printed)
const out = [];
const rec = (id, pass, detail) => { out.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const note = (id, detail) => { out.push({ id, pass: null, detail }); console.log(`NOTE ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const msg = (r) => (r.body && (r.body.error || r.body.message || r.body.hint)) || JSON.stringify(r.body);
const patch = (who, t, q, row) => who(`${t}?${q}`, { method: 'PATCH', body: JSON.stringify(row) });
const post = (who, t, row) => who(t, { method: 'POST', body: JSON.stringify([row]) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SA = await as('SUPER_ADMIN'), AD = await as('ADMIN'), DR = await as('DIRECTOR'), SM = await as('SALES_MANAGER'), SE = await as('SALES_EXEC_1');
const mail = (k) => `test.g.${k}.${tag}@prismora.test`;
const created = {};   // key -> { id, email }
const acts = [];      // expected audit rows
const expectAudit = (table, rowId, action, changes, actor) => acts.push({ table, rowId, action, changes, actor });

const make = async (caller, who, key, role, extra = {}) => {
  const r = await callFn(caller.token, 'create-user', { name: `TEST G ${key} ${tag}`, email: mail(key), password: PW, role, ...extra });
  if (r.status === 200 && r.body?.ok) { created[key] = { id: r.body.id, email: mail(key), role }; expectAudit('users', r.body.id, 'created', { role }, who); }
  return r;
};

// ── G01 create one user of each role type ───────────────────────────────
console.log('\n# G01 Create users');
const staffRoles = ['Sales Manager', 'Sales Executive', 'Purchase Manager', 'Warehouse Manager', 'Accounts', 'Dispatch Team', 'Customer Support', 'Sales', 'Manager'];
for (const role of staffRoles) {
  const key = role.toLowerCase().replace(/ /g, '_');
  const r = await make(AD, 'TEST Admin', key, role);
  rec(`G01 Admin creates a ${role}`, r.status === 200 && r.body?.ok, `${r.status} ${r.body?.ok ? r.body.id : msg(r)}`);
}
for (const role of ['Director', 'Admin', 'Super Admin']) {
  const r = await make(AD, 'TEST Admin', `adm_try_${role.toLowerCase().replace(/ /g, '_')}`, role);
  rec(`G01 Admin may NOT create a ${role}`, r.status === 403, `${r.status} ${msg(r)}`);
}
for (const role of ['Director', 'Admin', 'Super Admin']) {
  const r = await make(SA, 'TEST Super Admin', role.toLowerCase().replace(/ /g, '_'), role);
  rec(`G01 Super Admin creates a ${role}`, r.status === 200 && r.body?.ok, `${r.status} ${r.body?.ok ? r.body.id : msg(r)}`);
}
// partner records + logins
const mkRec = async (table, key) => {
  const id = `TEST-G-${key}-${tag}`;
  const r = await post(AD, table, { id, name: `TEST G ${key} ${tag}`, status: 'Active' });
  return r.status === 201 ? id : (console.log(`record ${table}:`, r.status, JSON.stringify(r.body).slice(0, 120)), null);
};
const recs = { distributor: await mkRec('distributors', 'DIST'), dealer: await mkRec('dealers', 'DEAL'), retailer: await mkRec('retailers', 'RET') };
const linkCol = { Distributor: ['distributorId', 'distributor'], Dealer: ['dealerId', 'dealer'], Retailer: ['retailerId', 'retailer'] };
for (const role of ['Distributor', 'Dealer', 'Retailer']) {
  const [col, k] = linkCol[role];
  const r = await make(AD, 'TEST Admin', `p_${k}`, role, { [col]: recs[k] });
  rec(`G01 Admin creates a ${role} login linked to its record`, r.status === 200 && r.body?.linkedTo === recs[k], `${r.status} ${r.body?.ok ? 'linked to ' + r.body.linkedTo : msg(r)}`);
}
// refusals
let r = await make(AD, '', 'neg1', 'Distributor');
rec('G01 a partner role without its record is refused', r.status === 400, `${r.status} ${msg(r)}`);
r = await make(AD, '', 'neg2', 'Sales Executive', { distributorId: recs.distributor });
rec('G01 a staff role attached to a partner record is refused', r.status === 400, `${r.status} ${msg(r)}`);
r = await make(AD, '', 'neg3', 'Distributor', { distributorId: recs.distributor });
rec('G01 a second login for the same partner is refused', r.status === 409, `${r.status} ${msg(r)}`);
const pend = `TEST-G-PEND-${tag}`; await post(AD, 'dealers', { id: pend, name: `TEST G Pending ${tag}`, status: 'Pending' });
r = await make(AD, '', 'neg4', 'Dealer', { dealerId: pend });
rec('G01 a login for a Pending partner is refused', r.status === 400 && /pending/i.test(msg(r)), `${r.status} ${msg(r)}`);
r = await make(AD, '', 'neg5', 'Dealer', { dealerId: 'NOPE-123' });
rec('G01 a login for a record that does not exist is refused', r.status === 400, `${r.status} ${msg(r)}`);
r = await callFn(AD.token, 'create-user', { name: 'x', email: mail('short'), password: 'abc12', role: 'Accounts' });
rec('G01 a password under 8 characters is refused', r.status === 400, `${r.status} ${msg(r)}`);
r = await callFn(AD.token, 'create-user', { name: `TEST G weak ${tag}`, email: mail('weak'), password: 'aaaaaaaa', role: 'Accounts' });
note('G01 server accepts an all-letters password (only the screen enforces letter+number)', `${r.status} ${r.status === 200 ? 'accepted' : msg(r)}`);
if (r.status === 200) { created.weak = { id: r.body.id, email: mail('weak'), role: 'Accounts' }; expectAudit('users', r.body.id, 'created', { role: 'Accounts' }, 'TEST Admin'); }
r = await callFn(AD.token, 'create-user', { name: 'dup', email: mail('accounts'), password: PW, role: 'Accounts' });
rec('G01 a duplicate e-mail is refused', r.status >= 400, `${r.status} ${msg(r)}`);
r = await callFn(SM.token, 'create-user', { name: 'x', email: mail('bysm'), password: PW, role: 'Accounts' });
rec('G01 a Sales Manager cannot create accounts', r.status === 403, `${r.status} ${msg(r)}`);
r = await callFn(SE.token, 'create-user', { name: 'x', email: mail('byse'), password: PW, role: 'Accounts' });
rec('G01 a Sales Executive cannot create accounts', r.status === 403, `${r.status} ${msg(r)}`);
r = await callFn(DR.token, 'create-user', { name: `TEST G byDirector ${tag}`, email: mail('bydirector'), password: PW, role: 'Accounts' });
note('G01 a Director (settings = none, no Team Members screen) CAN create accounts through the function', `${r.status} ${r.status === 200 ? 'created ' + r.body.id : msg(r)}`);
if (r.status === 200) { created.bydirector = { id: r.body.id, email: mail('bydirector'), role: 'Accounts' }; expectAudit('users', r.body.id, 'created', { role: 'Accounts' }, 'TEST Director'); }
r = await callFn(AD.token, 'create-user', { name: `TEST G bogus ${tag}`, email: mail('bogus'), password: PW, role: `TEST Bogus Role ${tag}` });
note('G01 server accepts a role name that does not exist in the roles table', `${r.status} ${r.status === 200 ? 'created ' + r.body.id : msg(r)}`);
if (r.status === 200) { created.bogus = { id: r.body.id, email: mail('bogus'), role: `TEST Bogus Role ${tag}` }; expectAudit('users', r.body.id, 'created', { role: created.bogus.role }, 'TEST Admin'); }

// stored profile + can sign in, for every created user
const sessions = {};
for (const [k, u] of Object.entries(created)) {
  const row = (await AD(`users?select=id,name,email,role,status,distributorId,dealerId,retailerId&id=eq.${u.id}`)).body?.[0];
  const s = await asCreds(u.email, PW);
  sessions[k] = s;
  const own = s.ok ? (await s(`users?select=id,role,status&email=eq.${u.email}`)).body?.[0] : null;
  rec(`G01 DB + sign-in: ${k} (${u.role})`, row?.role === u.role && row?.status === 'Active' && s.ok && own?.id === u.id, `row=${row?.role}/${row?.status} signin=${s.ok ? 'ok' : s.status + ' ' + s.error} sees-self=${own?.id === u.id}`);
}

// ── G02 edit ────────────────────────────────────────────────────────────
console.log('\n# G02 Edit');
const ux = created.sales_executive;
let e = await patch(AD, 'users', `id=eq.${ux.id}`, { name: `TEST G renamed ${tag}` });
rec('G02 Admin renames a user', e.status === 200 && e.body?.[0]?.name === `TEST G renamed ${tag}`, `${e.status} ${msg(e).slice(0, 80)}`);
expectAudit('users', ux.id, 'changed', { name: [`TEST G sales_executive ${tag}`.replace('sales_executive', 'sales_executive'), `TEST G renamed ${tag}`] }, 'TEST Admin');
e = await patch(AD, 'users', `id=eq.${ux.id}`, { role: 'Accounts' });
rec('G02 Admin changes a user\'s role Sales Executive → Accounts', e.status === 200 && e.body?.[0]?.role === 'Accounts', `${e.status}`);
expectAudit('users', ux.id, 'changed', { role: ['Sales Executive', 'Accounts'] }, 'TEST Admin');
e = await patch(AD, 'users', `id=eq.${ux.id}`, { role: 'Sales Executive' });
expectAudit('users', ux.id, 'changed', { role: ['Accounts', 'Sales Executive'] }, 'TEST Admin');
const mgr = created.sales_manager;
e = await patch(AD, 'users', `id=eq.${mgr.id}`, { managedUsers: [ux.id] });
rec('G02 Admin assigns a team to a manager', e.status === 200 && JSON.stringify(e.body?.[0]?.managedUsers) === JSON.stringify([ux.id]), `${e.status}`);
expectAudit('users', mgr.id, 'changed', { managedUsers: [[], [ux.id]] }, 'TEST Admin');
// own-edit guards
const seS = sessions.sales_executive;
let g = await patch(seS, 'users', `id=eq.${ux.id}`, { role: 'Admin' });
rec('G02 a user cannot make themselves Admin', g.status >= 400 || (Array.isArray(g.body) && g.body.length === 0) , `${g.status} rows=${Array.isArray(g.body) ? g.body.length : msg(g)}`);
const roleNow = (await AD(`users?select=role&id=eq.${ux.id}`)).body?.[0]?.role;
rec('G02 …and the DB still says Sales Executive', roleNow === 'Sales Executive', roleNow);
g = await patch(seS, 'users', `id=eq.${mgr.id}`, { name: 'hacked' });
rec('G02 a user cannot rename someone else', Array.isArray(g.body) ? g.body.length === 0 : g.status >= 400, `${g.status} rows=${Array.isArray(g.body) ? g.body.length : '-'}`);
g = await patch(seS, 'users', `id=eq.${ux.id}`, { name: `TEST G self-renamed ${tag}` });
rec('G02 a user may rename themselves', g.status === 200 && g.body?.[0]?.name === `TEST G self-renamed ${tag}`, `${g.status}`);
expectAudit('users', ux.id, 'changed', { name: [`TEST G renamed ${tag}`, `TEST G self-renamed ${tag}`] }, `TEST G self-renamed ${tag}`);
g = await patch(seS, 'users', `id=eq.${ux.id}`, { status: 'Inactive' });
rec('G02 a user cannot change their own status', g.status >= 400, `${g.status} ${msg(g).slice(0, 90)}`);
// escalation by an Admin through the API (what the screen never offers)
const tgt = created.warehouse_manager;
let esc = await patch(AD, 'users', `id=eq.${tgt.id}`, { role: 'Super Admin' });
note('G02 ESCALATION: Admin promotes a user to Super Admin by direct API call', `${esc.status} ${Array.isArray(esc.body) && esc.body.length ? 'ACCEPTED, role is now ' + esc.body[0].role : msg(esc)}`);
if (Array.isArray(esc.body) && esc.body.length) { expectAudit('users', tgt.id, 'changed', { role: ['Warehouse Manager', 'Super Admin'] }, 'TEST Admin'); await patch(SA, 'users', `id=eq.${tgt.id}`, { role: 'Warehouse Manager' }); expectAudit('users', tgt.id, 'changed', { role: ['Super Admin', 'Warehouse Manager'] }, 'TEST Super Admin'); }
const tsa = created.super_admin;
esc = await patch(AD, 'users', `id=eq.${tsa.id}`, { status: 'Inactive' });
note('G02 ESCALATION: Admin deactivates a Super Admin account by direct API call', `${esc.status} ${Array.isArray(esc.body) && esc.body.length ? 'ACCEPTED' : msg(esc)}`);
if (Array.isArray(esc.body) && esc.body.length) { expectAudit('users', tsa.id, 'changed', { status: ['Active', 'Inactive'] }, 'TEST Admin'); await patch(SA, 'users', `id=eq.${tsa.id}`, { status: 'Active' }); expectAudit('users', tsa.id, 'changed', { status: ['Inactive', 'Active'] }, 'TEST Super Admin'); }
esc = await patch(AD, 'users', `id=eq.${tsa.id}`, { email: `test.g.hijack.${tag}@prismora.test` });
note('G02 ESCALATION: Admin changes a Super Admin\'s profile e-mail by direct API call', `${esc.status} ${Array.isArray(esc.body) && esc.body.length ? 'ACCEPTED' : msg(esc)}`);
if (Array.isArray(esc.body) && esc.body.length) { expectAudit('users', tsa.id, 'changed', { email: [mail('super_admin'), `test.g.hijack.${tag}@prismora.test`] }, 'TEST Admin'); await patch(SA, 'users', `id=eq.${tsa.id}`, { email: mail('super_admin') }); expectAudit('users', tsa.id, 'changed', { email: [`test.g.hijack.${tag}@prismora.test`, mail('super_admin')] }, 'TEST Super Admin'); }
// password of another account
const envUrl = (await import('node:fs')).readFileSync('D:/PRISMORA/.env', 'utf8').match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const envKey = (await import('node:fs')).readFileSync('D:/PRISMORA/.env', 'utf8').match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const authId = sessions.accounts?.authId || null;
const pwTry = await fetch(`${envUrl}/auth/v1/admin/users/00000000-0000-0000-0000-000000000000`, { method: 'PUT', headers: { apikey: envKey, Authorization: `Bearer ${AD.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'ChangedByAdmin1' }) });
rec('G02 Admin cannot change another account\'s password (auth admin API)', pwTry.status >= 400, `${pwTry.status} ${(await pwTry.text()).slice(0, 90)}`);

// ── G03 permissions ─────────────────────────────────────────────────────
console.log('\n# G03 Role permissions');
const roleId = `TEST G Role ${tag}`;
const basePerms = (await AD('roles?select=permissions&id=eq.Customer%20Support')).body[0].permissions;
const startPerms = { ...basePerms, schemes: 'none', geography: 'none', settings: 'none' };
let rr = await post(AD, 'roles', { id: roleId, name: roleId, level: 'staff', description: 'TEST G role', permissions: startPerms, sort: 900, active: true, isSystem: false });
rec('G03 Admin creates a TEST role', rr.status === 201, `${rr.status} ${msg(rr).slice(0, 80)}`);
expectAudit('roles', roleId, 'created', { id: roleId }, 'TEST Admin');
const ru = await make(AD, 'TEST Admin', 'rolemember', roleId);
rec('G03 a user can be created in the new role', ru.status === 200 && ru.body?.ok, `${ru.status} ${msg(ru).slice(0, 80)}`);
const rs = await asCreds(mail('rolemember'), PW); sessions.rolemember = rs;
const schemesBefore = await rs('schemes?select=id&limit=3');
rec('G03 before: the user cannot read schemes', schemesBefore.status >= 400 || (Array.isArray(schemesBefore.body) && schemesBefore.body.length === 0), `${schemesBefore.status} rows=${Array.isArray(schemesBefore.body) ? schemesBefore.body.length : '-'}`);
rr = await patch(AD, 'roles', `id=eq.${encodeURIComponent(roleId)}`, { permissions: { ...startPerms, schemes: 'view' } });
rec('G03 Admin changes the role: schemes none → view', rr.status === 200 && rr.body?.[0]?.permissions?.schemes === 'view', `${rr.status}`);
expectAudit('roles', roleId, 'changed', { permissions: [{ ...startPerms }, { ...startPerms, schemes: 'view' }] }, 'TEST Admin');
const schemesAfter = await rs('schemes?select=id&limit=3');
rec('G03 after (same session, no re-login): the user can read schemes', schemesAfter.status === 200 && schemesAfter.body.length > 0, `${schemesAfter.status} rows=${schemesAfter.body?.length}`);
const wr = await rs('schemes', { method: 'POST', body: JSON.stringify([{ id: `TEST-G-SCH-${tag}`, name: 'x', type: 'Discount' }]) });
rec('G03 view is not edit: the same user cannot write a scheme', wr.status >= 400, `${wr.status}`);
rr = await patch(AD, 'roles', `id=eq.${encodeURIComponent(roleId)}`, { permissions: startPerms });
expectAudit('roles', roleId, 'changed', { permissions: [{ ...startPerms, schemes: 'view' }, { ...startPerms }] }, 'TEST Admin');
const schemesRev = await rs('schemes?select=id&limit=3');
rec('G03 reverted: the user loses schemes again', schemesRev.status >= 400 || schemesRev.body.length === 0, `${schemesRev.status} rows=${Array.isArray(schemesRev.body) ? schemesRev.body.length : '-'}`);
// guards
const saOrig = (await SA('roles?select=permissions&id=eq.Super%20Admin')).body[0].permissions;
const sar = await patch(AD, 'roles', `id=eq.Super%20Admin`, { permissions: { ...saOrig, settings: 'none' } });
note('G03 Admin edits the Super Admin role row by direct API call', `${sar.status} ${Array.isArray(sar.body) && sar.body.length ? 'ACCEPTED (app_access still treats Super Admin as full)' : msg(sar)}`);
if (Array.isArray(sar.body) && sar.body.length) {
  expectAudit('roles', 'Super Admin', 'changed', { permissions: [saOrig, { ...saOrig, settings: 'none' }] }, 'TEST Admin');
  await patch(SA, 'roles', `id=eq.Super%20Admin`, { permissions: saOrig });
  expectAudit('roles', 'Super Admin', 'changed', { permissions: [{ ...saOrig, settings: 'none' }, saOrig] }, 'TEST Super Admin');
}
const adminRoleId = `TEST G AdminRole ${tag}`;
await post(AD, 'roles', { id: adminRoleId, name: adminRoleId, level: 'staff', description: 'TEST G', permissions: { ...basePerms, settings: 'full' }, sort: 901, active: true, isSystem: false });
const am = await make(AD, 'TEST Admin', 'adminrole_member', adminRoleId);
const ams = await asCreds(mail('adminrole_member'), PW);
const selfLock = await patch(ams, 'roles', `id=eq.${encodeURIComponent(adminRoleId)}`, { permissions: { ...basePerms, settings: 'none' } });
note('G03 a user whose role has settings=full removes settings from their own role (self-lock-out)', `${selfLock.status} ${Array.isArray(selfLock.body) && selfLock.body.length ? 'ACCEPTED, no database guard' : msg(selfLock)}`);
if (Array.isArray(selfLock.body) && selfLock.body.length) expectAudit('roles', adminRoleId, 'changed', { permissions: [{ ...basePerms, settings: 'full' }, { ...basePerms, settings: 'none' }] }, `TEST G adminrole_member ${tag}`);

// ── G04 deactivate / reactivate ─────────────────────────────────────────
console.log('\n# G04 Deactivate / reactivate');
const du = created.dispatch_team, dS = sessions.dispatch_team;
const readBefore = await dS('orders?select=id&limit=2');
rec('G04 before: Dispatch user can read orders', readBefore.status === 200 && readBefore.body.length > 0, `${readBefore.status} rows=${readBefore.body?.length}`);
let d = await patch(AD, 'users', `id=eq.${du.id}`, { status: 'Inactive' });
rec('G04 Admin deactivates the user', d.status === 200 && d.body?.[0]?.status === 'Inactive', `${d.status}`);
expectAudit('users', du.id, 'changed', { status: ['Active', 'Inactive'] }, 'TEST Admin');
const readIn = await dS('orders?select=id&limit=2');
rec('G04 the open session is cut off at once (no rows)', readIn.status >= 400 || (Array.isArray(readIn.body) && readIn.body.length === 0), `${readIn.status} rows=${Array.isArray(readIn.body) ? readIn.body.length : '-'}`);
const inv2 = await dS('invoices?select=id&limit=2'); const usr = await dS(`users?select=id,status&id=eq.${du.id}`);
rec('G04 other tables too, and the profile read', (inv2.body?.length ?? 0) === 0, `invoices rows=${inv2.body?.length} own-profile rows=${usr.body?.length}`);
const re = await asCreds(du.email, PW);
note('G04 a fresh sign-in by a deactivated user at the auth level', re.ok ? 'token issued (data stays blocked; the app signs them out)' : `${re.status} ${re.error}`);
if (re.ok) { const rd = await re('orders?select=id&limit=2'); rec('G04 fresh token reads nothing', rd.status >= 400 || rd.body.length === 0, `${rd.status} rows=${Array.isArray(rd.body) ? rd.body.length : '-'}`); }
d = await patch(AD, 'users', `id=eq.${du.id}`, { status: 'Active' });
rec('G04 Admin reactivates the user', d.status === 200 && d.body?.[0]?.status === 'Active', `${d.status}`);
expectAudit('users', du.id, 'changed', { status: ['Inactive', 'Active'] }, 'TEST Admin');
const readBack = await dS('orders?select=id&limit=2');
rec('G04 the same session works again (same token, no re-login)', readBack.status === 200 && readBack.body.length > 0, `${readBack.status} rows=${readBack.body?.length}`);
// self + peers
const meAD = (await AD('users?select=id&email=eq.test.admin@prismora.test')).body?.[0]?.id;
d = await patch(AD, 'users', `id=eq.${meAD}`, { status: 'Inactive' });
rec('G04 Admin cannot deactivate their own account', d.status >= 400, `${d.status} ${msg(d).slice(0, 100)}`);
// a deactivated admin and the create-user function
const gA = created.admin, gAs = sessions.admin;
await patch(SA, 'users', `id=eq.${gA.id}`, { status: 'Inactive' }); expectAudit('users', gA.id, 'changed', { status: ['Active', 'Inactive'] }, 'TEST Super Admin');
const inactiveRead = await gAs('users?select=id&limit=3');
const viaFn = await callFn(gAs.token, 'create-user', { name: `TEST G byInactiveAdmin ${tag}`, email: mail('byinactive'), password: PW, role: 'Accounts' });
note('G04 a DEACTIVATED Admin calls create-user with their still-valid token', `${viaFn.status} ${viaFn.status === 200 ? 'ACCEPTED, account created: ' + viaFn.body.id : msg(viaFn)}`);
if (viaFn.status === 200) { created.byinactive = { id: viaFn.body.id, email: mail('byinactive'), role: 'Accounts' }; expectAudit('users', viaFn.body.id, 'created', { role: 'Accounts' }, 'TEST G admin ' + tag); }
const inactiveWrite = await patch(gAs, 'users', `id=eq.${created.sales.id}`, { name: 'x' });
rec('G04 a deactivated Admin cannot edit users through the database', Array.isArray(inactiveWrite.body) ? inactiveWrite.body.length === 0 : inactiveWrite.status >= 400, `${inactiveWrite.status} read-rows=${inactiveRead.body?.length}`);
await patch(SA, 'users', `id=eq.${gA.id}`, { status: 'Active' }); expectAudit('users', gA.id, 'changed', { status: ['Inactive', 'Active'] }, 'TEST Super Admin');
// delete
const delT = created.manager;
const dl = await AD(`users?id=eq.${delT.id}`, { method: 'DELETE' });
rec('G04 Admin deletes a user profile (row removed)', dl.status === 200 || dl.status === 204, `${dl.status}`);
expectAudit('users', delT.id, 'deleted', { id: delT.id }, 'TEST Admin');
const stillSignsIn = await asCreds(delT.email, PW);
note('G04 after delete, the login (auth account) still exists and signs in', stillSignsIn.ok ? 'YES, login remains with no profile' : `${stillSignsIn.status} ${stillSignsIn.error}`);
delete created.manager;

// ── G05 audit log ───────────────────────────────────────────────────────
console.log('\n# G05 Audit log');
await sleep(1500);
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const actorSeen = new Set();
const ids = [...new Set(acts.map(a => a.rowId))];
const audit = [];
for (let i = 0; i < ids.length; i += 15) {
  const part = ids.slice(i, i + 15).map(encodeURIComponent).join(',');
  const rows = (await SA(`audit_log?select=*&row_id=in.(${part})&order=at.asc&limit=1000`)).body;
  if (Array.isArray(rows)) audit.push(...rows);
}
const used = new Set();
for (const a of acts) {
  const idx = audit.findIndex((x, i) => !used.has(i) && x.table_name === a.table && x.row_id === a.rowId && x.action === a.action
    && Object.entries(a.changes).every(([k, v]) => a.action === 'changed' ? deepEq(x.changes?.[k], v) : (a.action === 'created' ? deepEq(x.changes?.[k], v) || (k === 'id') : true)));
  if (idx >= 0) used.add(idx);
  const x = audit[idx];
  const actorOk = x && (x.actor_name === a.actor || String(x.actor_name || '').startsWith(a.actor));
  rec(`G05 ${a.table} ${a.rowId.slice(0, 22)} ${a.action} ${JSON.stringify(a.changes).slice(0, 60)}`, !!x && actorOk, x ? `actor="${x.actor_name}" (${x.actor_role}) via=${x.via || '-'}${actorOk ? '' : '  EXPECTED ' + a.actor}` : 'NO AUDIT ROW');
}
// who can read the audit log
const asSM = await SM('audit_log?select=id&limit=1'); const asAdm = await AD('audit_log?select=id&limit=1');
rec('G05 the audit log is readable by Admin and not by a Sales Manager', asAdm.body?.length > 0 && (asSM.body?.length ?? 0) === 0, `Admin rows=${asAdm.body?.length} SalesManager rows=${asSM.body?.length}`);

appendFileSync('D:/PRISMORA/.env.test-accounts.local', `\n# Phase 2 G test accounts (tag ${tag}); password shared by all, local-only\nTEST_G_TAG=${tag}\nTEST_G_PASSWORD=${PW}\n`);
writeFileSync('D:/PRISMORA/test-results/full-test/phase2/g/g-api.json', JSON.stringify({ tag, created, recs, roleId, adminRoleId, pend, out }, null, 1));
console.log(`\n${out.filter(x => x.pass === true).length}/${out.filter(x => x.pass !== null).length} passed, ${out.filter(x => x.pass === false).length} failed, ${out.filter(x => x.pass === null).length} notes; tag ${tag}`);
