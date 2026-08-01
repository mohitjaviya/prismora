import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingCart, Map, Settings, Briefcase,
  UserCircle, X, Wallet, Package2, ShoppingBag, Network, Store, Building2,
  MessageSquareWarning, Tag, BarChart3, ChevronDown, ChevronRight, CalendarCheck,
  Boxes, Tags, FileCheck2, Gift, Brain
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isMobileMenuOpen, setIsMobileMenuOpen }) => {
  const { user, canAccess } = useAuth();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState({
    crm: false,
    ops: false,
    finance: false,
    support: false,
    analytics: false,
  });

  const toggleGroup = (group) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  // Auto-expand group if current path is a sub-item
  useEffect(() => {
    const path = location.pathname;
    setOpenGroups(prev => ({
      ...prev,
      crm: ['/leads', '/customers', '/geography', '/sfa'].includes(path) || prev.crm,
      ops: ['/orders', '/inventory', '/purchases', '/distributors', '/dealers', '/retailers', '/stock', '/price-list'].includes(path) || prev.ops,
      finance: ['/accounting', '/schemes', '/ledger', '/claims', '/incentives'].includes(path) || prev.finance,
      support: ['/complaints'].includes(path) || prev.support,
      analytics: ['/reports', '/ai-insights'].includes(path) || prev.analytics,
    }));
  }, [location.pathname]);

  const closeMobileMenu = () => setIsMobileMenuOpen && setIsMobileMenuOpen(false);

  const groups = [
    {
      id: 'crm',
      title: 'Sales & CRM',
      items: [
        { name: 'Leads', path: '/leads', icon: <Users size={18} />, module: 'leads' },
        { name: 'SFA / Field Beats', path: '/sfa', icon: <CalendarCheck size={18} />, module: 'sfa' },
        { name: 'Customers', path: '/customers', icon: <Briefcase size={18} />, module: 'customers' },
        { name: 'Geography', path: '/geography', icon: <Map size={18} />, module: 'geography' },
      ]
    },
    {
      id: 'ops',
      title: 'Operations',
      items: [
        { name: ['Distributor', 'Dealer', 'Retailer'].includes(user?.role) ? 'My Orders' : 'Orders', path: '/orders', icon: <ShoppingCart size={18} />, module: 'orders' },
        { name: 'Inventory', path: '/inventory', icon: <Package2 size={18} />, module: 'inventory' },
        { name: 'Purchases', path: '/purchases', icon: <ShoppingBag size={18} />, module: 'purchases' },
        { name: 'Distributors', path: '/distributors', icon: <Network size={18} />, module: 'distributors' },
        { name: 'Dealers', path: '/dealers', icon: <Store size={18} />, module: 'dealers' },
        { name: 'Retailers', path: '/retailers', icon: <Building2 size={18} />, module: 'retailers' },
        { name: 'Stock Availability', path: '/stock', icon: <Boxes size={18} />, module: 'stock' },
        { name: 'Price List', path: '/price-list', icon: <Tags size={18} />, module: 'priceList' },
      ]
    },
    {
      id: 'finance',
      title: 'Financials',
      items: [
        { name: 'Accounting', path: '/accounting', icon: <Wallet size={18} />, module: 'accounting' },
        { name: 'Schemes', path: '/schemes', icon: <Tag size={18} />, module: 'schemes' },
        { name: 'Ledger', path: '/ledger', icon: <Wallet size={18} />, module: 'ledger' },
        { name: 'Claims', path: '/claims', icon: <FileCheck2 size={18} />, module: 'claims' },
        { name: 'Incentives', path: '/incentives', icon: <Gift size={18} />, module: 'incentives' },
      ]
    },
    {
      id: 'support',
      title: 'Customer Support',
      items: [
        { name: 'Complaints', path: '/complaints', icon: <MessageSquareWarning size={18} />, module: 'complaints' },
      ]
    },
    {
      id: 'analytics',
      title: 'Analytics',
      items: [
        { name: 'Reports', path: '/reports', icon: <BarChart3 size={18} />, module: 'reports' },
        { name: 'AI Insights', path: '/ai-insights', icon: <Brain size={18} />, module: 'reports' },
      ]
    }
  ];

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center justify-between border-b border-white/5 bg-brand-primary-light/40 overflow-hidden relative px-4 flex-shrink-0">
        <img src="/logo.png" alt="PRISMORA Logo" className="w-60 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[55%] scale-110 pointer-events-none" />
        <button
          onClick={closeMobileMenu}
          className="md:hidden ml-auto relative z-10 text-slate-400 hover:text-white transition-colors p-1"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-3">
        <nav className="px-3 space-y-1">
          {/* Dashboard (always visible at top level) */}
          <NavLink
            to="/"
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 group text-sm ${
                isActive 
                  ? 'bg-gradient-to-r from-brand-primary-lighter/80 to-transparent text-brand-accent border-l-2 border-brand-accent shadow-sm' 
                  : 'text-slate-400 hover:bg-brand-primary-lighter/30 hover:text-white border-l-2 border-transparent'
              }`
            }
          >
            <span className="mr-3 transition-transform group-hover:scale-110 duration-200"><LayoutDashboard size={18} /></span>
            <span className="font-semibold">Dashboard</span>
          </NavLink>

          {/* Group Accordions */}
          {groups.map((group) => {
            const visibleItems = group.items.filter(item => canAccess(item.module));
            if (visibleItems.length === 0) return null;
            const isOpen = openGroups[group.id];
            const isGroupActive = visibleItems.some(item => location.pathname === item.path);

            return (
              <div key={group.id} className="space-y-0.5 pt-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-brand-primary-lighter/20 ${
                    isGroupActive ? 'text-brand-accent' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span>{group.title}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {isOpen && (
                  <div className="pl-2 space-y-0.5 border-l border-white/5 ml-4 mt-0.5 animate-fade-in-up">
                    {visibleItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={closeMobileMenu}
                        className={({ isActive }) =>
                          `flex items-center px-3.5 py-2 rounded-lg transition-all duration-200 group text-xs ${
                            isActive 
                              ? 'bg-brand-accent/10 text-brand-accent border-l-2 border-brand-accent font-semibold shadow-sm' 
                              : 'text-slate-400 hover:bg-brand-primary-lighter/30 hover:text-white border-l-2 border-transparent'
                          }`
                        }
                      >
                        <span className="mr-2.5 transition-transform group-hover:scale-110 duration-200">{item.icon}</span>
                        <span>{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {canAccess('settings') ? (
        <div className="p-4 border-t border-white/5 bg-brand-primary-light/20 flex-shrink-0">
          <NavLink
            to="/settings"
            onClick={closeMobileMenu}
            className="flex items-center px-4 py-2.5 rounded-xl text-slate-400 hover:bg-brand-primary-lighter/50 hover:text-white transition-all duration-300 text-sm"
          >
            <Settings size={18} className="mr-3" />
            <span className="font-semibold">Settings</span>
          </NavLink>
        </div>
      ) : (
        <div className="p-4 border-t border-white/5 bg-brand-primary-light/20 flex-shrink-0">
          <NavLink
            to="/profile"
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              `flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 text-sm ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary-lighter/80 to-transparent text-brand-accent border-l-2 border-brand-accent'
                  : 'text-slate-400 hover:bg-brand-primary-lighter/50 hover:text-white border-l-2 border-transparent'
              }`
            }
          >
            <UserCircle size={18} className="mr-3" />
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

