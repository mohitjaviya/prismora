import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Settings as SettingsIcon, Lock, History } from 'lucide-react';
import { PageHeader, DataTable, Badge } from '../components/ui';
import {  } from 'react-dom';
import { Navigate } from 'react-router-dom';



// Password policy: min 8 chars, at least one letter and one number.
const passwordPolicyError = (pw) => {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
};

export default function Settings() {
  const { user, updateUser, verifyCurrentPassword, canAccess } = useAuth();
  const { eventLog } = useData();

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'password'
  
  // Password States
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Below the hooks on purpose: a guard that returns above a useState makes
  // every hook after it conditional, so a role change mid-session would
  // crash the page rather than redirect it.
  // Granted by the role's Settings permission, not by being admin level --
  // Director is admin level and has no Settings access.
  if (!canAccess('settings')) return <Navigate to="/" replace />;

  // ── Password Handlers ────────────────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    const policyError = passwordPolicyError(passwordForm.newPassword);
    if (policyError) {
      setPasswordMessage({ type: 'error', text: policyError });
      return;
    }
    // The current password is checked by signing in with it, because there is
    // nothing left to compare it against — passwords moved to Supabase Auth and
    // the column this used to read was deleted. It was comparing against
    // undefined, so changing a password had become impossible.
    const verified = await verifyCurrentPassword(passwordForm.currentPassword);
    if (!verified) {
      setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }
    const ok = await updateUser(user.id, { password: passwordForm.newPassword });
    if (!ok) {
      setPasswordMessage({ type: 'error', text: 'Could not change the password. Please try again.' });
      return;
    }
    setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setTimeout(() => setPasswordMessage({ type: '', text: '' }), 3000);
  };

  const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
  const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

  // The audit trail is chronological and the newest entries are the point of
  // it, so it stays in the order the data layer returns and is not sortable.
  const auditColumns = [
    {
      key: 'timestamp', header: 'When',
      render: e => (
        <span className="font-mono text-slate-400 whitespace-nowrap">
          {e.timestamp
            ? new Date(e.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : '—'}
        </span>
      ),
    },
    {
      key: 'type', header: 'Action',
      render: e => <Badge tone="accent" className="font-mono">{e.type}</Badge>,
    },
    { key: 'message', header: 'Detail', render: e => <span className="text-slate-300">{e.message}</span> },
    {
      key: 'dataId', header: 'Ref', hideBelow: 'md',
      render: e => <span className="font-mono text-slate-500">{e.dataId || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={SettingsIcon}
        title="Admin Settings"
        subtitle="The audit trail, and your own password. Team members and the product catalogue moved to Master Lists."
      />

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1">
        {[
          ['audit', 'Audit Log', <History size={16} />],
          ['password', 'Change Password', <Lock size={16} />]
        ].map(([key, label, icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${activeTab === key ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {icon}{label}
          </button>
        ))}
      </div>



      {/* ── Tab: Audit Log ──────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <DataTable
            title="Audit trail"
            columns={auditColumns}
            rows={eventLog || []}
            rowKey={e => e.id}
            pageSize={50}
            search={e => `${e.type || ''} ${e.message || ''} ${e.dataId || ''}`}
            searchPlaceholder="Search by action or detail"
            empty={{
              icon: History,
              title: 'Nothing recorded yet',
              hint: 'Every create, update and delete is written here, along with order status changes, payments and approvals. It fills up as the system is used.',
            }}
          />
          <p className="text-[11px] text-slate-500">
            The audit trail records every create, update and delete, plus order status changes, payments and
            approvals across the platform.
          </p>
        </div>
      )}

      {/* ── Tab: Change Password ────────────────────────────────────────────── */}
      {activeTab === 'password' && (
        <div className="glass-panel rounded-2xl overflow-hidden p-6 border border-white/5 max-w-lg">
          <h3 className="text-lg font-bold text-white mb-4">Update Account Security</h3>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="settings-current-password" className={labelCls}>Current Password</label>
              <input id="settings-current-password" type="password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="settings-new-password" className={labelCls}>New Password</label>
              <input id="settings-new-password" type="password" required value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="settings-confirm-new-password" className={labelCls}>Confirm New Password</label>
              <input id="settings-confirm-new-password" type="password" required value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className={inputCls} />
            </div>
            {passwordMessage.text && (
              <p className={`text-xs ${passwordMessage.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{passwordMessage.text}</p>
            )}
            <button type="submit" className="btn-accent px-5 py-2.5 rounded-xl font-bold text-sm">Change Password</button>
          </form>
        </div>
      )}



    </div>
  );
}
