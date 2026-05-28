import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

const mockUsers = [
  { id: '1', name: 'Admin User', email: 'admin@prismora.com', role: 'Admin' },
  { id: '2', name: 'Manager User', email: 'manager@prismora.com', role: 'Manager' },
  { id: '3', name: 'Surbhi', email: 'surbhi@prismora.com', role: 'Sales' },
  { id: '4', name: 'Ruta', email: 'ruta@prismora.com', role: 'Sales' },
  { id: '5', name: 'Krina', email: 'krina@prismora.com', role: 'Sales' },
  { id: '6', name: 'Janki', email: 'janki@prismora.com', role: 'Sales' },
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Auto-login for demo purposes or check localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('prismora_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = (email) => {
    const foundUser = mockUsers.find(u => u.email === email);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('prismora_user', JSON.stringify(foundUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('prismora_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, mockUsers }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
