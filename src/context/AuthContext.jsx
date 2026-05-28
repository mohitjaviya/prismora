import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

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
    const { data } = await supabase.from('users').select('*');
    if (data) {
      setUsers(data);
      // Refresh the logged-in user's data from DB to keep it up to date
      const savedUser = localStorage.getItem('prismora_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const freshUser = data.find(u => u.id === parsed.id);
        if (freshUser) {
          setUser(freshUser);
          localStorage.setItem('prismora_user', JSON.stringify(freshUser));
        }
      }
    }
  };

  const login = async (email, password) => {
    // Query Supabase directly so login works even if users state hasn't loaded yet
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (data && !error) {
      setUser(data);
      localStorage.setItem('prismora_user', JSON.stringify(data));
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
      managedUsers: userData.managedUsers || []
    };
    setUsers([...users, newUser]);
    await supabase.from('users').insert([newUser]);
  };

  const updateUser = async (id, updatedData) => {
    setUsers(users.map(u => u.id === id ? { ...u, ...updatedData } : u));
    await supabase.from('users').update(updatedData).eq('id', id);

    if (user && user.id === id) {
      const newUser = { ...user, ...updatedData };
      setUser(newUser);
      localStorage.setItem('prismora_user', JSON.stringify(newUser));
    }
  };

  const deleteUser = async (id) => {
    setUsers(users.filter(u => u.id !== id));
    await supabase.from('users').delete().eq('id', id);
  };

  // RBAC Helper: Check if current user can see data assigned to `ownerId`
  const canAccessData = (ownerId) => {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    if (user.role === 'Manager') {
      return user.id === ownerId || (user.managedUsers && user.managedUsers.includes(ownerId));
    }
    return user.id === ownerId; // Sales can only see their own
  };

  // RBAC Helper: Returns list of users current user can assign data to
  const getAssignableUsers = () => {
    if (!user) return [];
    if (user.role === 'Admin') return users.filter(u => u.role === 'Sales');
    if (user.role === 'Manager') {
      return users.filter(u => user.managedUsers && user.managedUsers.includes(u.id));
    }
    return [];
  };

  return (
    <AuthContext.Provider value={{ user, users, login, logout, addUser, updateUser, deleteUser, canAccessData, getAssignableUsers }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
