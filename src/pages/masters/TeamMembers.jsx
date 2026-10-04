import { useState } from 'react';
import { useAuth, USER_ROLES, isManagerRole, isSalesRole, isAdminRole, roleLevel } from '../../context/AuthContext';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2, CheckSquare, Square, Users, X, Download, UserX, UserCheck } from 'lucide-react';
import { downloadExcel } from '../../utils/exportUtils';
import { useConfirm } from '../../context/DialogContext';
import { useToast } from '../../context/DialogContext';
import { Badge, Button, DataTable, IconButton, PageHeader } from '../../components/ui';
import { rolesAssignableBy, mayManageAccount, internalUsersOf, isInternalLevel } from '../../utils/roleUtils';

/**
 * The people who can sign in, and what each of them may reach.
 *
 * Lifted out of Settings so it sits with the rest of the master data. The list,
 * the form and the rules about who may create whom are unchanged by the move —
 * only where you find them.
 */

const BLANK_USER_FORM = { name: '', email: '', role: 'Sales Executive', managedUsers: [], password: '' };

// Min 8 characters, at least one letter and one number.
const passwordPolicyError = (pw) => {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
};

// Distributor, Dealer and Retailer are missing on purpose. A partner account
// is only meaningful attached to a partner record — every portal screen finds
// its partner with distributors.find(d => d.id === user.distributorId), and the
// row-level policies do the same — and this form has nowhere to say which
// record. Offering the role here produced accounts that signed in to an empty
// screen. They are created from the partner's own row instead, by the key
// button on Distributors, Dealers and Retailers.
const PARTNER_ROLES = ['Distributor', 'Dealer', 'Retailer'];
const staffRoles = USER_ROLES.filter(r => !PARTNER_ROLES.includes(r));

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

export default function TeamMembers() {
  const { user, users: allUsers, roles, addUser, createUserAccount, updateUser, deleteUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(BLANK_USER_FORM);
  const [isSavingUser, setIsSavingUser] = useState(false);
  // Staff and partner logins on separate tabs (Gap 6). Partner accounts are
  // told apart by their role's level, as on SFA (Gap 3). Their logins are
  // created from Distributors, Dealers and Retailers, but this is still the
  // only place to switch one off or delete it, so they keep a tab here.
  // Roles' Members "View" (Gap 10) links here with ?tab=partners&q=<email>.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get('tab') === 'partners' ? 'partners' : 'team'));
  const [linkedTab] = useState(tab);
  const linkedQuery = tab === linkedTab ? (searchParams.get('q') || '') : '';
  const staff = internalUsersOf(allUsers, roleLevel);
  const partnerLogins = (allUsers || []).filter(u => u && !isInternalLevel(roleLevel(u.role)));
  const onPartnerTab = tab === 'partners';
  const shown = onPartnerTab ? partnerLogins : staff;
  // What the server and database will accept from this person: only a Super
  // Admin hands out Super Admin, Admin or Director (071), or any role with
  // Settings = full (077).
  const fullSettingsRoles = (roles || []).filter(r => r.permissions?.settings === 'full').map(r => r.id);
  const selectableRoles = rolesAssignableBy(user?.role, staffRoles, editingUser?.role, fullSettingsRoles);

  const openUserAdd = () => { const assignable = rolesAssignableBy(user?.role, staffRoles, null, fullSettingsRoles); setEditingUser(null); setUserForm({ ...BLANK_USER_FORM, role: assignable.includes('Sales Executive') ? 'Sales Executive' : (assignable[0] || '') }); setIsUserModalOpen(true); };
  const openUserEdit = (u) => { setEditingUser(u); setUserForm({ name: u.name, email: u.email, role: u.role, managedUsers: u.managedUsers || [], password: '' }); setIsUserModalOpen(true); };

  // Waits for the database (or create-user): the form stays open with the
  // reason on a refusal and closes only once saved.
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    if (isSavingUser) return;
    if ((!editingUser || userForm.password) && passwordPolicyError(userForm.password)) {
      toast(passwordPolicyError(userForm.password), 'error');
      return;
    }
    const payload = { ...userForm, managedUsers: isManagerRole(userForm.role) ? userForm.managedUsers : [] };
    if (editingUser) {
      // Supabase Auth only lets an account change its own password, so editing a
      // colleague saves their profile and leaves their password alone.
      // The e-mail is never saved from here: it is what the person's sign-in is
      // matched to, so changing the profile alone would lock them out (073).
      const { password, email: _lockedEmail, ...profileOnly } = payload; // eslint-disable-line no-unused-vars
      setIsSavingUser(true);
      const ok = await updateUser(editingUser.id, editingUser.id === user?.id && password ? { ...profileOnly, password } : profileOnly);
      setIsSavingUser(false);
      if (!ok) { toast('The changes to ' + payload.name + ' were not saved — the database refused them.', 'error'); return; }
      toast(password && editingUser.id !== user?.id
        ? 'Profile saved. A password can only be changed by its own account holder, or reset from the Supabase dashboard.'
        : payload.name + ' saved.', 'success');
    } else {
      // The login is made server-side by the create-user function, which holds
      // the key that can do it. Falls back to the manual two-step where that
      // function has not been deployed.
      setIsSavingUser(true);
      const result = await createUserAccount(payload);
      setIsSavingUser(false);
      if (result.ok) toast(payload.name + ' can now sign in with ' + payload.email + '.', 'success');
      else if (result.needsDeploy) {
        addUser({ ...payload, createAuthAccount: false });
        toast('Profile created for ' + payload.email + ', but their login was not.' +
          String.fromCharCode(10, 10) +
          'The create-user function has not been deployed yet, so add the same email in ' +
          'Supabase → Authentication → Users (tick Auto Confirm) and they can sign in.', 'success');
      } else { toast('Could not create the account: ' + result.error, 'error'); return; }
    }
    setIsUserModalOpen(false);
  };

  // Switching an account off keeps its records and history, unlike Delete.
  // The database refuses an Inactive account everything, and an open session
  // is signed out within a minute (043, AuthContext).
  const setActive = async (u, active) => {
    const verb = active ? 'Reactivate' : 'Deactivate';
    if (!await confirm({
      title: `${verb} ${u.name}?`,
      body: active
        ? 'They will be able to sign in again with their existing password.'
        : 'They will be signed out and unable to sign in or read anything. Their records stay as they are.',
      danger: !active,
      confirmLabel: verb,
    })) return;
    const ok = await updateUser(u.id, { status: active ? 'Active' : 'Inactive' });
    toast(ok ? `${u.name} is now ${active ? 'active' : 'inactive'}.` : `${u.name} could not be ${active ? 'reactivated' : 'deactivated'}.`, ok ? 'success' : 'error');
  };

  // The row stays until the database has deleted it, and a refusal is shown.
  // Deleting also removes their sign-in, so the e-mail can be used again.
  const removeUser = async (u) => {
    if (!await confirm({
      title: `Delete ${u.name}?`,
      body: 'Their profile and their sign-in are removed, and the e-mail can be used again. Their records stay. Use Deactivate instead to keep the account.',
      danger: true, confirmLabel: 'Delete',
    })) return;
    const res = await deleteUser(u.id);
    toast(res?.ok ? `${u.name} was deleted.` : `${u.name} was not deleted: ${res?.error || 'the database refused it.'}`, res?.ok ? 'success' : 'error');
  };

  const toggleManagedUser = (userId) => {
    setUserForm(prev => {
      const current = prev.managedUsers || [];
      return { ...prev, managedUsers: current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId] };
    });
  };

  const userColumns = [
    {
      key: 'name', header: 'User', sort: u => u.name || '',
      render: u => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold text-[11px] uppercase flex-shrink-0">
            {String(u.name || '?').substring(0, 2)}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">{u.name}</div>
            <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', header: 'Role', sort: u => u.role || '',
      render: u => (
        <Badge tone={isAdminRole(u.role) ? 'purple' : isManagerRole(u.role) ? 'accent' : 'info'}>
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'status', header: 'Status', sort: u => u.status || '',
      render: u => (
        <Badge tone={u.status === 'Inactive' || u.status === 'Rejected' ? 'danger' : u.status === 'Pending' ? 'warning' : 'success'}>
          {u.status || 'Active'}
        </Badge>
      ),
    },
    {
      key: 'managed', header: 'Team Members Managed', hideBelow: 'lg',
      render: u => (isManagerRole(u.role)
        ? (
          <div className="flex flex-wrap gap-1">
            {u.managedUsers && u.managedUsers.length > 0
              ? u.managedUsers.map(id => {
                const mu = allUsers.find(x => x.id === id);
                return mu ? <Badge key={id} tone="neutral">{mu.name}</Badge> : null;
              })
              : <span className="italic text-slate-600">Nobody yet</span>}
          </div>
        )
        : <span className="text-slate-600">—</span>),
    },
    {
      key: 'actions', header: '', align: 'center', width: 'w-28',
      render: u => (
        <div className="flex items-center justify-center gap-0.5">
          {/* No Edit for a partner login: the form offers staff roles only,
              so saving it could turn a partner's account into a staff one. */}
          {!onPartnerTab && mayManageAccount(user?.role, u.role) && <IconButton icon={Edit2} title="Edit user" size="sm" tone="accent" onClick={() => openUserEdit(u)} />}
          {u.id !== user.id && mayManageAccount(user?.role, u.role) && (u.status === 'Inactive'
            ? <IconButton icon={UserCheck} title="Reactivate user" size="sm" tone="accent" onClick={() => setActive(u, true)} />
            : u.status !== 'Pending' && <IconButton icon={UserX} title="Deactivate user" size="sm" tone="danger" onClick={() => setActive(u, false)} />)}
          {u.id !== user.id && mayManageAccount(user?.role, u.role) && (
            <IconButton icon={Trash2} title="Delete user" size="sm" tone="danger"
              onClick={() => removeUser(u)} />
          )}
        </div>
      ),
    },
  ].filter(c => !(onPartnerTab && c.key === 'managed'));

  // Exports the tab on screen: staff, or partner logins.
  const handleExport = () => (onPartnerTab
    ? downloadExcel(partnerLogins.map(u => ({
      Name: u.name,
      Email: u.email,
      Role: u.role,
      Status: u.status || 'Active',
    })), 'PRISMORA_Partner_Logins')
    : downloadExcel(staff.map(u => ({
      Name: u.name,
      Email: u.email,
      Role: u.role,
      Status: u.status || 'Active',
      Manages: (u.managedUsers || [])
        .map(id => (allUsers.find(x => x.id === id) || {}).name)
        .filter(Boolean)
        .join('\n'),
    })), 'PRISMORA_Team_Members'));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Users}
        title="Team Members"
        subtitle="Who can sign in, and what each of them may reach."
        actions={<>
            <Button icon={Download} onClick={handleExport} disabled={!(shown.length > 0)}>Export</Button>
            {!onPartnerTab && <Button variant="primary" icon={Plus} onClick={openUserAdd}>Add User</Button>}
              </>}
      />

      <div className="flex border-b border-white/5 pb-px gap-1" role="tablist">
        {[['team', 'Team', staff.length], ['partners', 'Partner logins', partnerLogins.length]].map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition-all ${tab === key ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {label} ({count})
          </button>
        ))}
      </div>

      {onPartnerTab && (
        <p className="text-xs text-slate-500">
          Distributor, dealer and retailer portal logins. They are created with the key button on Distributors,
          Dealers and Retailers; here they can be switched off, back on, or deleted.
        </p>
      )}

      <DataTable
        key={tab}
        title={onPartnerTab ? 'Partner logins' : 'Team'}
        columns={userColumns}
        rows={shown}
        rowKey={u => u.id}
        search={u => `${u.name} ${u.email} ${u.role}`}
        searchPlaceholder="Search name, email or role"
        initialQuery={linkedQuery}
        empty={onPartnerTab ? {
          icon: Users,
          title: 'No partner has a portal login',
          hint: 'Create one with the key button on Distributors, Dealers or Retailers.',
        } : {
          icon: Users,
          title: 'Nobody has been added yet',
          hint: 'A team member gets a login and whatever their role allows. What each role can reach is set on Roles & Permissions.',
          action: <Button variant="primary" icon={Plus} onClick={openUserAdd}>Add User</Button>,
        }}
      />

  {isUserModalOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[6vh]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsUserModalOpen(false)} />
            <div className="relative glass-panel bg-brand-primary w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Users className="text-brand-accent" size={20} />{editingUser ? 'Edit User' : 'Add New User'}</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
              </div>
              <form onSubmit={handleUserSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div><label htmlFor="teammembers-full-name" className={labelCls}>Full Name *</label><input id="teammembers-full-name" required type="text" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} placeholder="e.g. Rahul Sharma" className={inputCls} /></div>
                <div><label htmlFor="teammembers-email-address" className={labelCls}>Email Address *</label><input id="teammembers-email-address" required type="email" disabled={!!editingUser} value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} placeholder="rahul@prismora.com" className={inputCls + (editingUser ? ' opacity-60 cursor-not-allowed' : '')} />{editingUser && <p className="mt-1 text-[11px] text-slate-500">The e-mail is their sign-in and cannot be changed. For a different e-mail, add a new user and deactivate this one.</p>}</div>
                <div><label htmlFor="teammembers-password" className={labelCls}>{editingUser ? 'New Password (optional)' : 'Password *'}</label><input id="teammembers-password" required={!editingUser} type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className={inputCls} /></div>
                <div>
                  <label htmlFor="teammembers-role" className={labelCls}>Role *</label>
                  <select id="teammembers-role" value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className={inputCls}>
                    {selectableRoles.map(role => (
                      <option key={role} value={role} className="bg-brand-primary">{role}</option>
                    ))}
                  </select>
                </div>

                {/* Manager checklist */}
                {isManagerRole(userForm.role) && (
                  <div className="bg-brand-primary-lighter/30 p-4 rounded-xl border border-white/5 space-y-2">
                    <span id="assign-team-members-group" className="block text-xs font-bold text-brand-accent uppercase tracking-wider">Assign Team Members</span>
                    <div role="group" aria-labelledby="assign-team-members-group" className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                      {allUsers.filter(u => isSalesRole(u.role)).map(su => {
                        const isSelected = userForm.managedUsers?.includes(su.id);
                        return (
                          <button type="button" key={su.id} onClick={() => toggleManagedUser(su.id)}
                            className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${isSelected ? 'bg-brand-accent/15 border-brand-accent text-white' : 'bg-brand-primary border-white/5 text-slate-400'}`}>
                            <span>{su.name} ({su.email})</span>
                            {isSelected ? <CheckSquare size={14} className="text-brand-accent" /> : <Square size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                  <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                  <button type="submit" disabled={isSavingUser} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{isSavingUser ? 'Saving…' : editingUser ? 'Save Changes' : 'Create User'}</button>
                </div>
              </form>
            </div>
          </div>, document.body
        )}
    </div>
  );
}
