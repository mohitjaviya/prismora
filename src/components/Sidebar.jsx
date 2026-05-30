import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingCart, Map, Settings, Briefcase, UserCircle, X, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isMobileMenuOpen, setIsMobileMenuOpen }) => {
  const { user } = useAuth();
  
  const baseNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Leads', path: '/leads', icon: <Users size={20} /> },
    { name: 'Orders', path: '/orders', icon: <ShoppingCart size={20} /> },
    { name: 'Geography', path: '/geography', icon: <Map size={20} /> },
  ];

  // Dynamically build navItems based on role
  let navItems = [...baseNavItems];
  if (user) {
    const items = [
      { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> }
    ];
    items.push({ name: 'Customers', path: '/customers', icon: <Briefcase size={20} /> });
    items.push({ name: 'Leads', path: '/leads', icon: <Users size={20} /> });
    items.push({ name: 'Orders', path: '/orders', icon: <ShoppingCart size={20} /> });
    
    if (user.role === 'Admin') {
      items.push({ name: 'Accounting', path: '/accounting', icon: <Wallet size={20} /> });
    }
    items.push({ name: 'Geography', path: '/geography', icon: <Map size={20} /> });
    navItems = items;
  }

  const closeMobileMenu = () => setIsMobileMenuOpen && setIsMobileMenuOpen(false);

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center justify-between border-b border-white/5 bg-brand-primary-light/40 overflow-hidden relative px-4">
        <img src="/logo.png" alt="PRISMORA Logo" className="w-60 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[55%] scale-110 pointer-events-none" />
        {/* Close button only visible on mobile */}
        <button
          onClick={closeMobileMenu}
          className="md:hidden ml-auto relative z-10 text-slate-400 hover:text-white transition-colors p-1"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-6">
        <nav className="space-y-2 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={closeMobileMenu}
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
            onClick={closeMobileMenu}
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
            onClick={closeMobileMenu}
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
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-64 glass-panel border-r border-white/5 hidden md:flex flex-col z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[150] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 h-full w-72 glass-panel border-r border-white/10 flex flex-col shadow-2xl animate-fade-in-up">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;

