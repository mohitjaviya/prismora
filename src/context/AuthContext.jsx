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

export const AuthProvider = ({ children }) => {
  // Initialize directly from localStorage so refresh never logs user out
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('prismora_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);

  const DEFAULT_USERS = [
    { id: 'U-admin',    name: 'Prismora Admin',           email: 'admin@prismora.com',     role: 'Super Admin',       password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-dir-1',   name: 'Arvind Mehta (Director)',   email: 'director@prismora.com',  role: 'Director',          password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-mgr-1',   name: 'Rajesh Kumar (North Mgr)',  email: 'rajesh@prismora.com',    role: 'Sales Manager',     password: 'password123', managedUsers: ['U-sales-1', 'U-sales-2'], status: 'Active' },
    { id: 'U-mgr-2',   name: 'Sunita Rao (South Mgr)',    email: 'sunita@prismora.com',    role: 'Sales Manager',     password: 'password123', managedUsers: ['U-sales-3', 'U-sales-4'], status: 'Active' },
    { id: 'U-sales-1', name: 'Rahul Sharma (Gujarat)',    email: 'rahul@prismora.com',     role: 'Sales Executive',   password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-sales-2', name: 'Amit Patel (Delhi)',        email: 'amit@prismora.com',      role: 'Sales Executive',   password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-sales-3', name: 'Vikram Singh (Mumbai)',     email: 'vikram@prismora.com',    role: 'Sales Executive',   password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-sales-4', name: 'Kiran Nair (Bangalore)',   email: 'kiran@prismora.com',     role: 'Sales Executive',   password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-pur-1',   name: 'Deepak Verma (Purchase)',  email: 'purchase@prismora.com',  role: 'Purchase Manager',  password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-wh-1',    name: 'Suresh Gupta (Warehouse)', email: 'warehouse@prismora.com', role: 'Warehouse Manager', password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-acc-1',   name: 'Priya Shah (Accounts)',    email: 'accounts@prismora.com',  role: 'Accounts',          password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-disp-1',  name: 'Ravi Yadav (Dispatch)',    email: 'dispatch@prismora.com',  role: 'Dispatch Team',     password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-cs-1',    name: 'Anita Desai (Support)',    email: 'support@prismora.com',   role: 'Customer Support',  password: 'password123', managedUsers: [], status: 'Active' },
    { id: 'U-dist-1',  name: 'Krishna Distributors',     email: 'dist@prismora.com',      role: 'Distributor',       password: 'password123', managedUsers: [], status: 'Active', distributorId: 'DIST-1' },
    { id: 'U-deal-1',  name: 'Mohan Dealers',            email: 'dealer@prismora.com',    role: 'Dealer',            password: 'password123', managedUsers: [], status: 'Active', dealerId: 'DEAL-1' },
    { id: 'U-ret-1',   name: 'Geeta Retailers',          email: 'retail@prismora.com',    role: 'Retailer',          password: 'password123', managedUsers: [], status: 'Active', retailerId: 'RET-1' },
  ];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    let fetched = [];
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      fetched = data || [];
      if (fetched.length === 0) {
        const local = localStorage.getItem('prismora_users');
        fetched = local ? JSON.parse(local) : DEFAULT_USERS;
      }
    } catch (err) {
      const local = localStorage.getItem('prismora_users');
      fetched = local ? JSON.parse(local) : DEFAULT_USERS;
    }

    // Always merge DEFAULT_USERS so new default accounts are available
    // even when old localStorage cache exists — never overwrites existing users
    const existingIds = new Set(fetched.map(u => u.id));
    const merged = [...fetched, ...DEFAULT_USERS.filter(u => !existingIds.has(u.id))];
    localStorage.setItem('prismora_users', JSON.stringify(merged));
    setUsers(merged);
    
    // Refresh the logged-in user's data
    const savedUser = localStorage.getItem('prismora_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      const freshUser = fetched.find(u => u.id === parsed.id);
      if (freshUser) {
        setUser(freshUser);
        localStorage.setItem('prismora_user', JSON.stringify(freshUser));
      }
    }
  };

  // Returns true (success) | false (invalid credentials) | 'pending' | 'rejected'
  const login = async (email, password) => {
    try {
      // 1. Try querying Supabase directly
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (data && !error) {
        if (data.status === 'Pending') return 'pending';
        if (data.status === 'Rejected') return 'rejected';
        setUser(data);
        localStorage.setItem('prismora_user', JSON.stringify(data));
        return true;
      }
    } catch (err) {
      console.warn("Supabase query failed during login, checking local users state.", err);
    }

    // 2. Fallback to searching the loaded users list state (which contains local storage + DEFAULT_USERS)
    const matched = users.find(u => u.email === email && u.password === password);
    if (matched) {
      if (matched.status === 'Pending') return 'pending';
      if (matched.status === 'Rejected') return 'rejected';
      setUser(matched);
      localStorage.setItem('prismora_user', JSON.stringify(matched));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('prismora_user');
  };

  const addUser = async (userData) => {
    const newId = `U${Date.now()}`;
    const newUser = {
      ...userData,
      password: userData.password || 'password123',
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
