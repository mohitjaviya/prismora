import { useState } from 'react';
import { useAuth, USER_ROLES, isManagerRole, isSalesRole, isAdminRole } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Plus, Edit2, Trash2, Settings as SettingsIcon, Users,
  CheckSquare, Square, Lock, Package, QrCode, X, DollarSign, Percent, FileText, History, Search
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';

const INDIAN_TAX_RATES = [0, 5, 12, 18, 28];
const PRODUCT_CATEGORIES = ['Hair Care', 'Skin Care', 'Wellness', 'Personal Care', 'Other'];
const UOMS = ['BOX', 'BOTTLE', 'TUBE', 'STRIP', 'PIECE', 'KG'];

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const BLANK_USER_FORM = { name: '', email: '', role: 'Sales Executive', managedUsers: [], password: '' };
const PRODUCT_STATUSES = ['Active', 'Seasonal', 'Coming Soon', 'Discontinued'];

// Password policy: min 8 chars, at least one letter and one number.
const passwordPolicyError = (pw) => {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
};
const BLANK_PRODUCT_FORM = { name: '', category: 'Wellness', hsnCode: '', sku: '', gstPct: 12, mrp: '', distributorPrice: '', dealerPrice: '', retailerPrice: '', uom: 'BOTTLE', status: 'Active' };

export default function Settings() {
  const { user, users: allUsers, addUser, updateUser, deleteUser } = useAuth();
  const { productCatalog, addProduct, updateProduct, deleteProduct, eventLog } = useData();
  const [auditSearch, setAuditSearch] = useState('');

  if (!isAdminRole(user?.role)) return <Navigate to="/" replace />;

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'products' | 'password'
  
  // User Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(BLANK_USER_FORM);

  // Product Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(BLANK_PRODUCT_FORM);
  const [viewingQrProduct, setViewingQrProduct] = useState(null);

  // Password States
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // ── User Handlers ────────────────────────────────────────────────────────
  const openUserAdd = () => { setEditingUser(null); setUserForm(BLANK_USER_FORM); setIsUserModalOpen(true); };
  const openUserEdit = (u) => { setEditingUser(u); setUserForm({ name: u.name, email: u.email, role: u.role, managedUsers: u.managedUsers || [], password: '' }); setIsUserModalOpen(true); };
  
  const handleUserSubmit = (e) => {
    e.preventDefault();
    // Enforce password policy on new users (and on edits that set a new password)
    if ((!editingUser || userForm.password) && passwordPolicyError(userForm.password)) {
      alert(passwordPolicyError(userForm.password));
      return;
    }
    const payload = { ...userForm, managedUsers: isManagerRole(userForm.role) ? userForm.managedUsers : [] };
    if (editingUser) updateUser(editingUser.id, payload);
    else addUser(payload);
    setIsUserModalOpen(false);
  };

  const toggleManagedUser = (userId) => {
    setUserForm(prev => {
      const current = prev.managedUsers || [];
      return {
        ...prev,
        managedUsers: current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
      };
    });
  };

  // ── Product Handlers ─────────────────────────────────────────────────────
  const openProductAdd = () => { setEditingProduct(null); setProductForm(BLANK_PRODUCT_FORM); setIsProductModalOpen(true); };
  const openProductEdit = (p) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name, category: p.category || 'Wellness', hsnCode: p.hsnCode || '', sku: p.sku || '',
      gstPct: p.gstPct || 12, mrp: p.mrp || '',
      distributorPrice: p.distributorPrice || '', dealerPrice: p.dealerPrice || '',
      retailerPrice: p.retailerPrice || '', uom: p.uom || 'BOTTLE', status: p.status || 'Active'
    });
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...productForm,
      gstPct: Number(productForm.gstPct),
      mrp: Number(productForm.mrp || 0),
      distributorPrice: Number(productForm.distributorPrice || 0),
      dealerPrice: Number(productForm.dealerPrice || 0),
      retailerPrice: Number(productForm.retailerPrice || 0)
    };
    if (editingProduct) updateProduct(editingProduct.id, payload);
    else addProduct(payload);
    setIsProductModalOpen(false);
  };

  // ── Password Handlers ────────────────────────────────────────────────────
  const handlePasswordSubmit = (e) => {
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
    const currentUser = allUsers.find(u => u.id === user.id);
    if (currentUser?.password !== passwordForm.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }
    updateUser(user.id, { password: passwordForm.newPassword });
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
          <p className="text-slate-400 text-sm mt-1">Manage platform users, product catalog pricing, HSN codes, and safety.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'users' && (
            <button onClick={openUserAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Add User
            </button>
          )}
          {activeTab === 'products' && (
            <button onClick={openProductAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1">
        {[
          ['users', 'Team Management', <Users size={16} />],
          ['products', 'Product Catalog', <Package size={16} />],
          ['audit', 'Audit Log', <History size={16} />],
          ['password', 'Change Password', <Lock size={16} />]
        ].map(([key, label, icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${activeTab === key ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Team Management ────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">User</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Team Members Managed</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {allUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold text-xs uppercase">
                        {u.name.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isAdminRole(u.role) ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : isManagerRole(u.role) ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {isManagerRole(u.role) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.managedUsers && u.managedUsers.length > 0 ? (
                            u.managedUsers.map(managedId => {
                              const mu = allUsers.find(x => x.id === managedId);
                              return mu ? <span key={managedId} className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{mu.name}</span> : null;
                            })
                          ) : <span className="italic text-slate-600">No managed users</span>}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openUserEdit(u)} className="p-1 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                        {u.id !== user.id && (
                          <button onClick={() => { if (confirm('Delete this user?')) deleteUser(u.id); }} className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Product Catalog ────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Product / SKU</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">HSN</th>
                  <th className="p-4 text-center">GST %</th>
                  <th className="p-4 text-right">MRP</th>
                  <th className="p-4 text-right">Distributor (₹)</th>
                  <th className="p-4 text-right">Dealer (₹)</th>
                  <th className="p-4 text-right">Retailer (₹)</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {productCatalog.length > 0 ? productCatalog.map(p => (
                  <tr key={p.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{p.sku || 'No SKU'} · {p.uom || 'BOX'}</div>
                    </td>
                    <td className="p-4 text-xs"><span className="bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full">{p.category}</span></td>
                    <td className="p-4 text-center">
                      {(() => {
                        const s = p.status || 'Active';
                        const cls = s === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : s === 'Seasonal' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : s === 'Coming Soon' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{s}</span>;
                      })()}
                    </td>
                    <td className="p-4 text-center font-mono text-xs text-slate-400">{p.hsnCode || '—'}</td>
                    <td className="p-4 text-center font-bold text-brand-accent">{p.gstPct}%</td>
                    <td className="p-4 text-right font-medium text-slate-300">{formatCurrency(p.mrp)}</td>
                    <td className="p-4 text-right font-bold text-white">{formatCurrency(p.distributorPrice)}</td>
                    <td className="p-4 text-right text-slate-400">{formatCurrency(p.dealerPrice)}</td>
                    <td className="p-4 text-right text-slate-400">{formatCurrency(p.retailerPrice)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setViewingQrProduct(p)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Generate QR Barcode"><QrCode size={14} /></button>
                        <button onClick={() => openProductEdit(p)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors" title="Edit"><Edit2 size={14} /></button>
                        <button onClick={() => { if (confirm('Delete this product?')) deleteProduct(p.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="10" className="p-8 text-center text-slate-500">No products found in catalog.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* ── User Add/Edit Modal ────────────────────────────────────────────── */}
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

      {/* ── Product Add/Edit Modal ─────────────────────────────────────────── */}
      {isProductModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsProductModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Package className="text-brand-accent" size={20} />{editingProduct ? 'Edit Catalog Product' : 'Add New Product'}</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleProductSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Product Name *</label><input required type="text" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Brahmi Amla Shakar 200ml" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} className={inputCls}>
                    {PRODUCT_CATEGORIES.map(c => <option key={c} value={c} className="bg-brand-primary">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Unit of Measure (UOM)</label>
                  <select value={productForm.uom} onChange={e => setProductForm({ ...productForm, uom: e.target.value })} className={inputCls}>
                    {UOMS.map(u => <option key={u} value={u} className="bg-brand-primary">{u}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>SKU / Barcode</label><input type="text" value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} placeholder="e.g. PRM-HHO-100" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Lifecycle Status</label>
                  <select value={productForm.status} onChange={e => setProductForm({ ...productForm, status: e.target.value })} className={inputCls}>
                    {PRODUCT_STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>HSN Code *</label><input required type="text" value={productForm.hsnCode} onChange={e => setProductForm({ ...productForm, hsnCode: e.target.value })} placeholder="e.g. 30049011" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>GST Rate *</label>
                  <select value={productForm.gstPct} onChange={e => setProductForm({ ...productForm, gstPct: e.target.value })} className={inputCls}>
                    {INDIAN_TAX_RATES.map(r => <option key={r} value={r} className="bg-brand-primary">{r}% GST</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>MRP (Retail Price Limit) (₹)</label><input type="number" min="0" value={productForm.mrp} onChange={e => setProductForm({ ...productForm, mrp: e.target.value })} placeholder="0" className={inputCls} /></div>
                <div><label className={labelCls}>Distributor Base Price (₹) *</label><input required type="number" min="0" value={productForm.distributorPrice} onChange={e => setProductForm({ ...productForm, distributorPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
                <div><label className={labelCls}>Dealer Base Price (₹) *</label><input required type="number" min="0" value={productForm.dealerPrice} onChange={e => setProductForm({ ...productForm, dealerPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
                <div><label className={labelCls}>Retailer Base Price (₹) *</label><input required type="number" min="0" value={productForm.retailerPrice} onChange={e => setProductForm({ ...productForm, retailerPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingProduct ? 'Save Changes' : 'Create Product'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* ── QR Barcode Preview Modal ──────────────────────────────────────── */}
      {viewingQrProduct && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingQrProduct(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-sm rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6 flex flex-col items-center text-center">
            <div className="w-full flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5"><QrCode size={18} className="text-brand-accent" />QR Barcode</h3>
              <button onClick={() => setViewingQrProduct(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-white/10 shadow-lg mb-4">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=112240&bgcolor=ffffff&data=${encodeURIComponent(`PRISMORA-PROD:${viewingQrProduct.id}:${viewingQrProduct.name}:HSN:${viewingQrProduct.hsnCode}`)}`} 
                alt="Product QR Barcode" 
                className="w-40 h-40"
              />
            </div>
            <h4 className="font-bold text-white text-base">{viewingQrProduct.name}</h4>
            <p className="text-xs text-slate-400 mt-0.5">HSN: {viewingQrProduct.hsnCode || 'N/A'} &nbsp;|&nbsp; GST: {viewingQrProduct.gstPct}%</p>
            <div className="bg-brand-primary-lighter/30 rounded-xl p-2.5 mt-3 border border-white/5 w-full text-xs text-slate-300 font-medium">
              MRP: <span className="font-bold text-white">{formatCurrency(viewingQrProduct.mrp)}</span> &nbsp;|&nbsp; Dist: <span className="font-bold text-brand-accent">{formatCurrency(viewingQrProduct.distributorPrice)}</span>
            </div>
            <button onClick={() => setViewingQrProduct(null)} className="mt-5 w-full py-2.5 rounded-xl bg-brand-primary-lighter text-slate-300 hover:text-white text-sm font-semibold">Done</button>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
