import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const USER_ROLES = [
  'Super Admin',
  'Director',
  'Sales Manager',
  'Sales Executive',
  'Purchase Manager',
  'Warehouse Manager',
  'Accounts',
  'Dispatch Team',
  'Customer Support',
  'Distributor',
  'Dealer',
  'Retailer'
];

export const isAdminRole = (role) => ['Super Admin', 'Director', 'Admin'].includes(role);
export const isManagerRole = (role) => ['Sales Manager', 'Purchase Manager', 'Manager'].includes(role);
export const isSalesRole = (role) => ['Sales Executive', 'Sales'].includes(role);

// Full permission matrix — 'full' | 'view' | 'none'
export const PERMISSIONS = {
  'Super Admin': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'full', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'full', schemes:'full', complaints:'full', reports:'full', settings:'full',
    ledger:'full', claims:'full', incentives:'full', stock:'full', priceList:'full'
  },
  'Director': {
    dashboard:'full', leads:'view', sfa:'view', customers:'view', geography:'view',
    orders:'view', inventory:'view', purchases:'view', distributors:'view', dealers:'view', retailers:'view',
    accounting:'full', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales Manager': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'view', inventory:'view', purchases:'none', distributors:'view', dealers:'view', retailers:'view',
    accounting:'none', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales Executive': {
    dashboard:'full', leads:'full', sfa:'full', customers:'view', geography:'view',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Purchase Manager': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'view', schemes:'none', complaints:'none', reports:'view', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Warehouse Manager': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'full', inventory:'full', purchases:'view', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'none', complaints:'none', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Accounts': {
    dashboard:'full', leads:'none', sfa:'none', customers:'view', geography:'none',
    orders:'view', inventory:'none', purchases:'view', distributors:'view', dealers:'view', retailers:'view',
    accounting:'full', schemes:'view', complaints:'none', reports:'full', settings:'none',
    ledger:'none', claims:'full', incentives:'full', stock:'none', priceList:'none'
  },
  'Dispatch Team': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'full', inventory:'view', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'none', complaints:'none', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Customer Support': {
    dashboard:'full', leads:'view', sfa:'none', customers:'full', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  },
  'Distributor': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  'Dealer': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  'Retailer': {
    dashboard:'full', leads:'none', sfa:'none', customers:'none', geography:'none',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'view', claims:'full', incentives:'view', stock:'view', priceList:'view'
  },
  // Legacy roles for backwards compatibility
  'Admin': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'full', inventory:'full', purchases:'full', distributors:'full', dealers:'full', retailers:'full',
    accounting:'full', schemes:'full', complaints:'full', reports:'full', settings:'full',
    ledger:'full', claims:'full', incentives:'full', stock:'full', priceList:'full'
  },
  'Manager': {
    dashboard:'full', leads:'full', sfa:'full', customers:'full', geography:'full',
    orders:'view', inventory:'view', purchases:'none', distributors:'view', dealers:'view', retailers:'view',
    accounting:'none', schemes:'view', complaints:'view', reports:'full', settings:'none',
    ledger:'none', claims:'view', incentives:'view', stock:'none', priceList:'none'
  },
  'Sales': {
    dashboard:'full', leads:'full', sfa:'full', customers:'view', geography:'view',
    orders:'view', inventory:'none', purchases:'none', distributors:'none', dealers:'none', retailers:'none',
    accounting:'none', schemes:'view', complaints:'full', reports:'none', settings:'none',
    ledger:'none', claims:'none', incentives:'none', stock:'none', priceList:'none'
  }
};

const AuthContext = createContext();

// Password never travels further than the sign-in check.
const withoutPassword = (u) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};

export const AuthProvider = ({ children }) => {
  // Initialize directly from localStorage so refresh never logs user out
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('prismora_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);


  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    // Accounts come from Supabase and nowhere else. There used to be a
    // DEFAULT_USERS list merged in here and used as a login fallback, which
    // shipped a working Super Admin password inside the JavaScript bundle —
    // anyone who opened the deployed site could sign in as admin@prismora.com.
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      const fetched = data || [];
      setUsers(fetched);

      // Refresh the signed-in user's own record so a role or permission change
      // takes effect without them signing out.
      const savedUser = localStorage.getItem('prismora_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const fresh = fetched.find(u => u.id === parsed.id);
        if (fresh) {
          const safe = withoutPassword(fresh);
          setUser(safe);
          localStorage.setItem('prismora_user', JSON.stringify(safe));
        } else {
          // The account no longer exists — end the session rather than keep
          // trusting a stale copy in this browser.
          logout();
        }
      }
    } catch (err) {
      console.error('[Prismora] Could not load user accounts from Supabase.', err?.message || err);
    }
  };

  // Returns true (success) | false (invalid credentials) | 'pending' | 'rejected'
  const login = async (email, password) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (error || !data) return false;
      if (data.status === 'Pending') return 'pending';
      if (data.status === 'Rejected') return 'rejected';

      // The password is never kept in the session copy — it does not need to be
      // in this browser once the account has been verified.
      const safe = withoutPassword(data);
      setUser(safe);
      localStorage.setItem('prismora_user', JSON.stringify(safe));
      return true;
    } catch (err) {
      // No offline fallback: a browser that cannot reach Supabase cannot verify
      // a password, and guessing is how the demo-account hole worked.
      console.error('[Prismora] Sign-in failed — could not reach the account service.', err?.message || err);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('prismora_user');
  };

  const addUser = async (userData) => {
    const newId = `U${Date.now()}`;
    // No default password. Every caller (Settings, and the three signup forms)
    // collects one and Settings enforces a policy on it, so falling back to a
    // known string here only ever created an account anyone could guess into.
    if (!userData.password) {
      console.error('[Prismora] Refusing to create an account with no password.');
      return null;
    }
    const newUser = {
      ...userData,
      id: newId,
      managedUsers: userData.managedUsers || [],
      status: userData.status || 'Active'
    };
    setUsers(prev => {
      const next = [...prev, newUser];
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').insert([newUser]); } catch { /* ok */ }
    return newId;
  };

  const updateUser = async (id, updatedData) => {
    setUsers(prev => {
      const next = prev.map(u => u.id === id ? { ...u, ...updatedData } : u);
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').update(updatedData).eq('id', id); } catch { /* ok */ }

    if (user && user.id === id) {
      const newUser = { ...user, ...updatedData };
      setUser(newUser);
      localStorage.setItem('prismora_user', JSON.stringify(newUser));
    }
  };

  const deleteUser = async (id) => {
    setUsers(prev => {
      const next = prev.filter(u => u.id !== id);
      localStorage.setItem('prismora_users', JSON.stringify(next));
      return next;
    });
    try { await supabase.from('users').delete().eq('id', id); } catch { /* ok */ }
  };

  // RBAC Helper: Check if current user can see data assigned to `ownerId`
  const canAccessData = (ownerId) => {
    if (!user) return false;
    if (isAdminRole(user.role)) return true;
    if (isManagerRole(user.role)) {
      return user.id === ownerId || (user.managedUsers && user.managedUsers.includes(ownerId));
    }
    return user.id === ownerId; // Sales and other roles can only see their own
  };

  // RBAC Helper: Returns list of users current user can assign data to
  const getAssignableUsers = () => {
    if (!user) return [];
    if (isAdminRole(user.role)) return users.filter(u => isSalesRole(u.role));
    if (isManagerRole(user.role)) {
      return users.filter(u => user.managedUsers && user.managedUsers.includes(u.id));
    }
    return [];
  };

  // RBAC Helper: Check if user can access a module
  // level = 'view' (default) | 'full'
  const canAccess = (module, level = 'view') => {
    if (!user) return false;
    const rolePerms = PERMISSIONS[user.role];
    if (!rolePerms) return isAdminRole(user.role); // unknown role: grant if admin-tier
    const access = rolePerms[module] || 'none';
    if (access === 'none') return false;
    if (level === 'full') return access === 'full';
    return true; // 'view' or 'full' both satisfy a 'view' check
  };

  const isAdmin = user ? isAdminRole(user.role) : false;
  const isManager = user ? isManagerRole(user.role) : false;
  const isSales = user ? isSalesRole(user.role) : false;

  return (
    <AuthContext.Provider value={{ user, users, login, logout, addUser, updateUser, deleteUser, canAccessData, getAssignableUsers, canAccess, isAdmin, isManager, isSales }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
