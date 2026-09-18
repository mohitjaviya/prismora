import { useState } from 'react';
import { useAuth, USER_ROLES, isManagerRole, isSalesRole, isAdminRole } from '../../context/AuthContext';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, CheckSquare, Square, Users, X } from 'lucide-react';
import { useToast } from '../../context/DialogContext';
import { PageHeader, DataTable, Button, IconButton, Badge } from '../../components/ui';

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

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

export default function TeamMembers() {
  const { user, users: allUsers, addUser, createUserAccount, updateUser, deleteUser } = useAuth();
  const toast = useToast();

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(BLANK_USER_FORM);

  const openUserAdd = () => { setEditingUser(null); setUserForm(BLANK_USER_FORM); setIsUserModalOpen(true); };
  const openUserEdit = (u) => { setEditingUser(u); setUserForm({ name: u.name, email: u.email, role: u.role, managedUsers: u.managedUsers || [], password: '' }); setIsUserModalOpen(true); };

  const handleUserSubmit = (e) => {
    e.preventDefault();
    if ((!editingUser || userForm.password) && passwordPolicyError(userForm.password)) {
      toast(passwordPolicyError(userForm.password), 'error');
      return;
    }
    const payload = { ...userForm, managedUsers: isManagerRole(userForm.role) ? userForm.managedUsers : [] };
    if (editingUser) {
      // Supabase Auth only lets an account change its own password, so editing a
      // colleague saves their profile and leaves their password alone.
      const { password, ...profileOnly } = payload;
      updateUser(editingUser.id, editingUser.id === user?.id ? payload : profileOnly);
      if (password && editingUser.id !== user?.id) {
        toast('Profile saved. A password can only be changed by its own account holder, or reset from the Supabase dashboard.', 'success');
      }
    } else {
      // The login is made server-side by the create-user function, which holds
      // the key that can do it. Falls back to the manual two-step where that
      // function has not been deployed.
      createUserAccount(payload).then(result => {
        if (result.ok) { toast(payload.name + ' can now sign in with ' + payload.email + '.', 'success'); return; }
        if (result.needsDeploy) {
          addUser({ ...payload, createAuthAccount: false });
          toast('Profile created for ' + payload.email + ', but their login was not.' +
            String.fromCharCode(10, 10) +
            'The create-user function has not been deployed yet, so add the same email in ' +
            'Supabase → Authentication → Users (tick Auto Confirm) and they can sign in.', 'success');
          return;
        }
        toast('Could not create the account: ' + result.error, 'error');
      });
    }
    setIsUserModalOpen(false);
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
      key: 'actions', header: '', align: 'center', width: 'w-24',
      render: u => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton icon={Edit2} title="Edit user" size="sm" tone="accent" onClick={() => openUserEdit(u)} />
          {u.id !== user.id && (
            <IconButton icon={Trash2} title="Delete user" size="sm" tone="danger"
              onClick={() => { if (confirm('Delete this user?')) deleteUser(u.id); }} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Users}
        title="Team Members"
        subtitle="Who can sign in, and what each of them may reach."
        actions={<Button variant="primary" icon={Plus} onClick={openUserAdd}>Add User</Button>}
      />

      <DataTable
        title="Team"
        columns={userColumns}
        rows={allUsers}
        rowKey={u => u.id}
        search={u => `${u.name} ${u.email} ${u.role}`}
        searchPlaceholder="Search name, email or role"
        empty={{
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
                <div><label className={labelCls}>Full Name *</label><input required type="text" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} placeholder="e.g. Rahul Sharma" className={inputCls} /></div>
                <div><label className={labelCls}>Email Address *</label><input required type="email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} placeholder="rahul@prismora.com" className={inputCls} /></div>
                <div><label className={labelCls}>{editingUser ? 'New Password (optional)' : 'Password *'}</label><input required={!editingUser} type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Role *</label>
                  <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className={inputCls}>
                    {USER_ROLES.map(role => (
                      <option key={role} value={role} className="bg-brand-primary">{role}</option>
                    ))}
                  </select>
                </div>

                {/* Manager checklist */}
                {isManagerRole(userForm.role) && (
                  <div className="bg-brand-primary-lighter/30 p-4 rounded-xl border border-white/5 space-y-2">
                    <label className="block text-xs font-bold text-brand-accent uppercase tracking-wider">Assign Team Members</label>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
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
                  <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingUser ? 'Save Changes' : 'Create User'}</button>
                </div>
              </form>
            </div>
          </div>, document.body
        )}
    </div>
  );
}
