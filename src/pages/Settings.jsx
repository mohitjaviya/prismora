import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Settings as SettingsIcon, Users, CheckSquare, Square } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';

const Settings = () => {
  const { user, users: allUsers, addUser, updateUser, deleteUser } = useAuth();
  
  // Protect this route from non-admins just in case
  if (user?.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '', email: '', role: 'Sales', managedUsers: [], password: ''
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  const handleOpenModal = (targetUser = null) => {
    if (targetUser) {
      setEditingUser(targetUser);
      setFormData({
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        managedUsers: targetUser.managedUsers || [],
        password: '' // Admin cannot view old password, only set a new one if they type it here
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '', email: '', role: 'Sales', managedUsers: [], password: ''
      });
    }
    setIsModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setIsModalOpen(false);
    document.body.style.overflow = 'auto';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const dataToSave = {
      ...formData,
      managedUsers: formData.role === 'Manager' ? formData.managedUsers : []
    };

    if (editingUser) {
      updateUser(editingUser.id, dataToSave);
    } else {
      addUser(dataToSave);
    }
    closeModal();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    
    // Check if current password is correct
    const currentUser = allUsers.find(u => u.id === user.id);
    
    if (currentUser?.password !== passwordForm.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }

    // Update password
    updateUser(user.id, { password: passwordForm.newPassword });
    setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    
    setTimeout(() => setPasswordMessage({ type: '', text: '' }), 3000);
  };

  const toggleManagedUser = (userId) => {
    setFormData(prev => {
      const current = prev.managedUsers || [];
      if (current.includes(userId)) {
        return { ...prev, managedUsers: current.filter(id => id !== userId) };
      } else {
        return { ...prev, managedUsers: [...current, userId] };
      }
    });
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'Admin': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Manager': return 'bg-brand-accent/10 text-brand-accent border-brand-accent/20';
      case 'Sales': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  // Get all sales users for the checklist
  const salesUsers = allUsers.filter(u => u.role === 'Sales');

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <SettingsIcon size={24} className="text-brand-accent" />
            Admin Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage users, roles, and team hierarchy.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent text-brand-primary font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-brand-accent/20"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Add User</span>
        </button>
      </div>

      {/* Change Password Section (Visible to all users) */}
      <div className="glass-panel rounded-2xl overflow-hidden p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Current Password</label>
            <input 
              type="password" 
              required 
              value={passwordForm.currentPassword} 
              onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} 
              className="w-full glass-input rounded-lg px-4 py-2 text-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
            <input 
              type="password" 
              required 
              value={passwordForm.newPassword} 
              onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} 
              className="w-full glass-input rounded-lg px-4 py-2 text-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Confirm New Password</label>
            <input 
              type="password" 
              required 
              value={passwordForm.confirmPassword} 
              onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} 
              className="w-full glass-input rounded-lg px-4 py-2 text-white" 
            />
          </div>
          {passwordMessage.text && (
            <p className={`text-sm ${passwordMessage.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {passwordMessage.text}
            </p>
          )}
          <button 
            type="submit"
            className="bg-brand-primary-lighter hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2 rounded-lg transition-colors"
          >
            Update Password
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-brand-primary-lighter/30 flex items-center gap-3">
          <Users size={18} className="text-brand-accent" />
          <h2 className="text-lg font-bold text-white">Team Management</h2>
        </div>
        
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-brand-primary-lighter/50 text-slate-400 border-b border-slate-700/50">
              <tr>
                <th className="px-6 py-4 font-medium">User / Email</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Team Configuration</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {allUsers.map((u) => (
                <tr key={u.id} className="hover:bg-brand-primary-lighter/30 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold text-xs uppercase">
                      {u.name.substring(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium text-white">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleColor(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {u.role === 'Manager' ? (
                      <div className="flex flex-wrap gap-1">
                        {u.managedUsers && u.managedUsers.length > 0 ? (
                          u.managedUsers.map(managedId => {
                            const managedUser = allUsers.find(mu => mu.id === managedId);
                            return managedUser ? (
                              <span key={managedId} className="text-xs bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                {managedUser.name}
                              </span>
                            ) : null;
                          })
                        ) : (
                          <span className="text-xs italic opacity-50">No assigned team members</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs opacity-30">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleOpenModal(u)} className="text-blue-400 hover:text-blue-300 mr-3 transition-colors">
                      <Edit2 size={16} />
                    </button>
                    {u.id !== user.id && (
                      <button onClick={() => deleteUser(u.id)} className="text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm">
          <div className="bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-brand-primary-light z-10">
              <h2 className="text-xl font-bold text-white">{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-white" 
                  placeholder="e.g. John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-white" 
                  placeholder="john@prismora.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  {editingUser ? 'Reset Password (optional)' : 'Initial Password'}
                </label>
                <input 
                  type="text" 
                  required={!editingUser}
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-white" 
                  placeholder={editingUser ? "Leave blank to keep current password" : "e.g. securepassword123"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                <select 
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value})} 
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                  disabled={editingUser && editingUser.id === user.id} // Don't allow changing own role
                >
                  <option value="Admin" className="bg-brand-primary">Admin</option>
                  <option value="Manager" className="bg-brand-primary">Manager</option>
                  <option value="Sales" className="bg-brand-primary">Sales</option>
                </select>
                {editingUser && editingUser.id === user.id && (
                  <p className="text-xs text-yellow-500/80 mt-1">You cannot change your own role.</p>
                )}
              </div>

              {/* Conditional Manager Team Selection */}
              {formData.role === 'Manager' && (
                <div className="bg-brand-primary-lighter/30 p-4 rounded-xl border border-white/5 space-y-3 animate-fade-in-up">
                  <div>
                    <label className="block text-sm font-bold text-brand-accent">Assigned Team Members</label>
                    <p className="text-xs text-slate-400 mt-0.5">Select the Sales members this manager will oversee.</p>
                  </div>
                  
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {salesUsers.length > 0 ? salesUsers.map(su => {
                      const isSelected = formData.managedUsers?.includes(su.id);
                      return (
                        <button
                          key={su.id}
                          type="button"
                          onClick={() => toggleManagedUser(su.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            isSelected 
                              ? 'bg-brand-accent/10 border-brand-accent/30 text-white' 
                              : 'bg-brand-primary border-white/5 text-slate-400 hover:bg-white/5'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="text-brand-accent shrink-0" size={18} />
                          ) : (
                            <Square className="shrink-0 opacity-50" size={18} />
                          )}
                          <div className="text-left">
                            <div className={`text-sm font-medium ${isSelected ? 'text-white' : ''}`}>{su.name}</div>
                            <div className="text-xs opacity-70">{su.email}</div>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="text-sm text-slate-500 py-2">No sales users available.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-700/50">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-brand-accent hover:bg-brand-accent-light text-brand-primary font-bold px-6 py-2.5 rounded-xl transition-all hover:scale-105 shadow-lg shadow-brand-accent/20"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default Settings;

