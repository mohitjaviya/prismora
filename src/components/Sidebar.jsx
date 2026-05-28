import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingCart, Map, Settings, Briefcase, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user } = useAuth();
  
  const baseNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Leads', path: '/leads', icon: <Users size={20} /> },
    { name: 'Orders', path: '/orders', icon: <ShoppingCart size={20} /> },
    { name: 'Geography', path: '/geography', icon: <Map size={20} /> },
  ];

  // Inject Customers for Admins
  const navItems = user?.role === 'Admin' 
    ? [
        baseNavItems[0], 
        { name: 'Customers', path: '/customers', icon: <Briefcase size={20} /> },
        ...baseNavItems.slice(1)
      ]
    : baseNavItems;

  return (
    <aside className="w-64 glass-panel border-r border-white/5 hidden md:flex flex-col z-20">
      <div className="h-16 flex items-center justify-center border-b border-white/5 bg-brand-primary-light/40 overflow-hidden relative">
        <img src="/logo.png" alt="PRISMORA Logo" className="w-60 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[55%] scale-110 pointer-events-none" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-6">
        <nav className="space-y-2 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActive 
                    ? 'bg-gradient-to-r from-brand-primary-lighter/80 to-transparent text-brand-accent border-l-2 border-brand-accent shadow-md' 
                    : 'text-slate-400 hover:bg-brand-primary-lighter/50 hover:text-white border-l-2 border-transparent'
                }`
              }
            >
              <span className="mr-3 transition-transform group-hover:scale-110 duration-300">{item.icon}</span>
              <span className="font-semibold">{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {user?.role === 'Admin' ? (
        <div className="p-4 border-t border-white/5 bg-brand-primary-light/20">
          <NavLink
            to="/settings"
            className="flex items-center px-4 py-3 rounded-xl text-slate-400 hover:bg-brand-primary-lighter/50 hover:text-white transition-all duration-300"
          >
            <Settings size={20} className="mr-3" />
            <span className="font-semibold">Settings</span>
          </NavLink>
        </div>
      ) : (
        <div className="p-4 border-t border-white/5 bg-brand-primary-light/20">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary-lighter/80 to-transparent text-brand-accent border-l-2 border-brand-accent'
                  : 'text-slate-400 hover:bg-brand-primary-lighter/50 hover:text-white border-l-2 border-transparent'
              }`
            }
          >
            <UserCircle size={20} className="mr-3" />
            <span className="font-semibold">My Profile</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

