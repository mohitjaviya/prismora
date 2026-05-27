import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Lock, Users, Shield, Eye, EyeOff } from 'lucide-react';

const Profile = () => {
  const { user, users: allUsers, updateUser } = useAuth();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = (e) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    const currentUserRecord = allUsers.find(u => u.id === user.id);
    if (currentUserRecord?.password !== passwordForm.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }

    updateUser(user.id, { password: passwordForm.newPassword });
    setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setTimeout(() => setPasswordMessage({ type: '', text: '' }), 4000);
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'Admin': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Manager': return 'bg-brand-accent/10 text-brand-accent border-brand-accent/30';
      case 'Sales': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  // For Manager: find which sales users they manage
  const managedTeam = user?.role === 'Manager'
    ? allUsers.filter(u => user.managedUsers?.includes(u.id))
    : [];

  // For Sales: find which manager manages them
  const myManager = user?.role === 'Sales'
    ? allUsers.find(u => u.role === 'Manager' && u.managedUsers?.includes(user.id))
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <User size={24} className="text-brand-accent" />
          My Profile
        </h1>
        <p className="text-slate-400 text-sm mt-1">View your account details and manage your password.</p>
      </div>

      {/* Identity Card */}
      <div className="glass-panel rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-brand-accent/10 border-2 border-brand-accent/30 text-brand-accent flex items-center justify-center font-bold text-2xl uppercase shrink-0">
          {user?.name?.substring(0, 2) || 'U'}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold text-white">{user?.name}</div>
          <div className="text-slate-400 text-sm mt-0.5">{user?.email}</div>
          <div className="mt-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRoleColor(user?.role)}`}>
              {user?.role}
            </span>
          </div>
        </div>
        <Shield size={40} className="text-brand-accent/10 shrink-0" />
      </div>

      {/* Team Information */}
      {user?.role === 'Manager' && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users size={20} className="text-brand-accent" />
            <h2 className="text-lg font-bold text-white">Your Team</h2>
            <span className="ml-auto text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2.5 py-1 rounded-full font-medium">
              {managedTeam.length} member{managedTeam.length !== 1 ? 's' : ''}
            </span>
          </div>
          {managedTeam.length > 0 ? (
            <div className="space-y-3">
              {managedTeam.map(member => (
                <div key={member.id} className="flex items-center gap-3 bg-brand-primary/50 rounded-xl p-3 border border-white/5">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                    {member.name.substring(0, 2)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{member.name}</div>
                    <div className="text-xs text-slate-500">{member.email}</div>
                  </div>
                  <span className="ml-auto text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">Sales</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic">No team members assigned yet. Contact Admin.</p>
          )}
        </div>
      )}

      {user?.role === 'Sales' && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users size={20} className="text-brand-accent" />
            <h2 className="text-lg font-bold text-white">Your Manager</h2>
          </div>
          {myManager ? (
            <div className="flex items-center gap-4 bg-brand-primary/50 rounded-xl p-4 border border-brand-accent/10">
              <div className="w-12 h-12 rounded-full bg-brand-accent/10 border-2 border-brand-accent/20 text-brand-accent flex items-center justify-center font-bold text-lg uppercase shrink-0">
                {myManager.name.substring(0, 2)}
              </div>
              <div>
                <div className="font-bold text-white">{myManager.name}</div>
                <div className="text-slate-400 text-sm">{myManager.email}</div>
                <span className="mt-1 inline-block text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full">Manager</span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic">You are not yet assigned to a manager. Contact Admin.</p>
          )}
        </div>
      )}

      {/* Change Password */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Lock size={20} className="text-brand-accent" />
          <h2 className="text-lg font-bold text-white">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full glass-input rounded-lg px-4 py-2.5 text-white pr-10"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full glass-input rounded-lg px-4 py-2.5 text-white pr-10"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full glass-input rounded-lg px-4 py-2.5 text-white pr-10"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {passwordMessage.text && (
            <div className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${
              passwordMessage.type === 'error'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-green-500/10 text-green-400 border-green-500/20'
            }`}>
              {passwordMessage.text}
            </div>
          )}

          <button
            type="submit"
            className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent text-brand-primary font-bold px-6 py-2.5 rounded-xl transition-all hover:scale-105 shadow-lg shadow-brand-accent/20"
          >
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
