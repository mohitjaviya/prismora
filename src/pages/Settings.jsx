import { useState } from 'react';
import { useAuth, isAdminRole } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Settings as SettingsIcon, Lock, History, Search } from 'lucide-react';
import {  } from 'react-dom';
import { Navigate } from 'react-router-dom';



// Password policy: min 8 chars, at least one letter and one number.
const passwordPolicyError = (pw) => {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
};

export default function Settings() {
  const { user, updateUser, verifyCurrentPassword } = useAuth();
  const { eventLog } = useData();
  const [auditSearch, setAuditSearch] = useState('');

  if (!isAdminRole(user?.role)) return <Navigate to="/" replace />;

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'password'
  
  // Password States
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

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

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <SettingsIcon size={24} className="text-brand-accent" />
            Admin Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">The audit trail, and your own password. Team members and the product catalogue moved to Master Lists.</p>
        </div>
        <div className="flex gap-3">
        </div>
      </div>

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
          <div className="glass-panel rounded-2xl p-4 border border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search audit trail by action or detail..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
            </div>
          </div>
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Detail</th>
                    <th className="p-4">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {(() => {
                    const q = auditSearch.toLowerCase();
                    const rows = (eventLog || []).filter(e => !q || (e.type || '').toLowerCase().includes(q) || (e.message || '').toLowerCase().includes(q));
                    return rows.length > 0 ? rows.slice(0, 300).map(e => (
                      <tr key={e.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                        <td className="p-4 text-xs font-mono text-slate-400 whitespace-nowrap">{e.timestamp ? new Date(e.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="p-4"><span className="text-[10px] font-bold bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full font-mono">{e.type}</span></td>
                        <td className="p-4 text-xs text-slate-300">{e.message}</td>
                        <td className="p-4 text-xs font-mono text-slate-500">{e.dataId || '—'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="4" className="p-12 text-center text-slate-500">
                        <History size={32} className="mx-auto mb-3 opacity-20" />
                        <p>No audit events{auditSearch ? ' match your search' : ' recorded yet'}.</p>
                      </td></tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">Showing the most recent 300 events. The audit trail records every create/update/delete, order status change, payment, and approval across the platform.</p>
        </div>
      )}

      {/* ── Tab: Change Password ────────────────────────────────────────────── */}
      {activeTab === 'password' && (
        <div className="glass-panel rounded-2xl overflow-hidden p-6 border border-white/5 max-w-lg">
          <h3 className="text-lg font-bold text-white mb-4">Update Account Security</h3>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Current Password</label>
              <input type="password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>New Password</label>
              <input type="password" required value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Confirm New Password</label>
              <input type="password" required value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className={inputCls} />
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
