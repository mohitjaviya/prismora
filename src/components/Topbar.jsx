import { Menu, Bell, User, LogOut, Search, Sun, Moon, CalendarClock, Activity, CheckCircle, XCircle, Package, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { isToday, formatDistanceToNow } from 'date-fns';

const Topbar = ({ setIsMobileMenuOpen }) => {
  const { user, logout, canAccessData } = useAuth();
  const { leads, orders, eventLog } = useData();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [searchResults, setSearchResults] = useState({ leads: [], orders: [] });
  const searchRef = useRef(null);

  // Track which notifications have been read
  const [readIds, setReadIds] = useState([]);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`prismora_read_notifications_${user.id}`);
      setReadIds(saved ? JSON.parse(saved) : []);
    } else {
      setReadIds([]);
    }
  }, [user]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchResults({ leads: [], orders: [] });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults({ leads: [], orders: [] });
      return;
    }

    const lowerQuery = query.toLowerCase();
    
    // Filter logic respecting user role
    const visibleLeads = leads.filter(l => canAccessData(l.assignedTo));
    const visibleOrders = orders.filter(o => canAccessData(o.assignedTo));

    const matchedLeads = visibleLeads.filter(l => 
      l.name.toLowerCase().includes(lowerQuery) || 
      l.company.toLowerCase().includes(lowerQuery)
    ).slice(0, 3);

    const matchedOrders = visibleOrders.filter(o => 
      o.id.toLowerCase().includes(lowerQuery) || 
      o.customerName.toLowerCase().includes(lowerQuery)
    ).slice(0, 3);

    setSearchResults({ leads: matchedLeads, orders: matchedOrders });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigateToResult = (path, id) => {
    setSearchQuery('');
    setSearchResults({ leads: [], orders: [] });
    navigate(`${path}?searchId=${id}`);
  };

  // Compute due leads globally for notifications (ONLY for Sales users)
  const dueToday = leads.filter(l => {
    if (user?.role !== 'Sales') return false; // Hide follow-ups from Admin/Manager
    if (!canAccessData(l.assignedTo)) return false;
    if (!l.followUpDate) return false;
    try {
      return isToday(new Date(l.followUpDate)) && l.status !== 'Converted' && l.status !== 'Lost';
    } catch(e) { return false; }
  });

  // Filter event log for Managers and Admins only
  const visibleEvents = (user?.role === 'Admin' || user?.role === 'Manager')
    ? (eventLog || []).filter(ev => canAccessData(ev.assignedTo))
    : [];

  const unreadDueToday = dueToday.filter(l => !readIds.includes(l.id));
  const unreadEvents = visibleEvents.filter(ev => !readIds.includes(ev.id));
  const unreadCount = unreadDueToday.length + unreadEvents.length;
  const totalNotifications = dueToday.length + visibleEvents.length;

  const handleMarkAllRead = () => {
    const allIds = [...dueToday.map(l => l.id), ...visibleEvents.map(e => e.id)];
    const newIds = Array.from(new Set([...readIds, ...allIds]));
    setReadIds(newIds);
    if (user) {
      localStorage.setItem(`prismora_read_notifications_${user.id}`, JSON.stringify(newIds));
    }
  };

  const markAsReadAndNavigate = (id, path) => {
    if (!readIds.includes(id)) {
      const newIds = [...readIds, id];
      setReadIds(newIds);
      if (user) {
        localStorage.setItem(`prismora_read_notifications_${user.id}`, JSON.stringify(newIds));
      }
    }
    setNotificationsOpen(false);
    navigateToResult(path, id);
  };

  const getEventIcon = (type) => {
    switch(type) {
      case 'lead_new': return <Activity size={14} className="text-blue-400" />;
      case 'lead_converted': return <CheckCircle size={14} className="text-brand-accent" />;
      case 'lead_lost': return <XCircle size={14} className="text-red-400" />;
      case 'order_processing': return <Package size={14} className="text-blue-400" />;
      case 'order_delivered': return <Truck size={14} className="text-green-400" />;
      default: return <Activity size={14} className="text-slate-400" />;
    }
  };

  const getEventPath = (type) => {
    if (type.startsWith('lead')) return '/leads';
    if (type.startsWith('order')) return '/orders';
    return '/';
  };

  return (
    <header className="h-16 shrink-0 glass-panel border-b border-white/5 flex items-center justify-between px-4 md:px-6 z-20 sticky top-0 rounded-b-xl mx-4 mt-2">
      <div className="flex items-center md:hidden">
        <button 
          onClick={() => setIsMobileMenuOpen && setIsMobileMenuOpen(true)}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>
        <span className="ml-4 text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 hidden sm:block">PRISMORA</span>
      </div>
      
      <div className="hidden md:flex items-center w-1/3 min-w-[250px] relative" ref={searchRef}>
        <Search size={18} className="absolute left-3 text-slate-400" />
        <input 
          type="text" 
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search leads, orders, customers..." 
          className="w-full glass-input rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 outline-none"
        />
        
        {/* Search Results Dropdown */}
        {(searchResults.leads.length > 0 || searchResults.orders.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 glass-panel rounded-xl shadow-2xl border border-white/10 overflow-hidden z-50 animate-fade-in-up">
            {searchResults.leads.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-semibold text-brand-accent px-2 mb-1 uppercase tracking-wider">Leads</div>
                {searchResults.leads.map(l => (
                  <button key={l.id} onClick={() => navigateToResult('/leads', l.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex justify-between items-center group">
                    <div>
                      <div className="text-sm text-white font-medium group-hover:text-brand-accent transition-colors">{l.name}</div>
                      <div className="text-xs text-slate-400">{l.company}</div>
                    </div>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-slate-300">{l.status}</span>
                  </button>
                ))}
              </div>
            )}
            
            {searchResults.orders.length > 0 && (
              <div className="p-2 border-t border-white/5 bg-brand-primary-lighter/30">
                <div className="text-xs font-semibold text-blue-400 px-2 mb-1 uppercase tracking-wider">Orders</div>
                {searchResults.orders.map(o => (
                  <button key={o.id} onClick={() => navigateToResult('/orders', o.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex justify-between items-center group">
                    <div>
                      <div className="text-sm text-white font-medium group-hover:text-blue-400 transition-colors">{o.id}</div>
                      <div className="text-xs text-slate-400">{o.customerName}</div>
                    </div>
                    <span className="text-xs text-slate-300">₹{o.value.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 sm:gap-6 ml-auto pl-4">
        <div className="hidden sm:block text-right mr-2">
          <h2 className="text-sm font-semibold text-slate-200 leading-tight">Welcome, {user?.name}</h2>
          <p className="text-xs text-brand-accent">{user?.role}</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsDark(!isDark)}
            className="relative text-slate-400 hover:text-brand-accent transition-colors p-2 hover:bg-brand-primary-lighter rounded-full"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="relative">
            <button 
              onClick={() => { setNotificationsOpen(!notificationsOpen); setDropdownOpen(false); }}
              className={`relative transition-colors p-2 rounded-full ${notificationsOpen ? 'bg-brand-primary-lighter text-white' : 'text-slate-400 hover:text-white hover:bg-brand-primary-lighter'}`}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-brand-primary shadow-sm shadow-red-500/50 animate-pulse"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 glass-panel border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-fade-in-up">
                <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-sm">Notifications</h3>
                    {unreadCount > 0 && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">{unreadCount} New</span>}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-brand-accent hover:text-brand-accent-light transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  
                  {/* Due Today Follow-ups */}
                  {dueToday.map(lead => {
                    const isUnread = !readIds.includes(lead.id);
                    return (
                      <button 
                        key={lead.id} 
                        onClick={() => markAsReadAndNavigate(lead.id, '/leads')}
                        className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-start gap-3 group ${isUnread ? 'bg-white/5' : ''}`}
                      >
                        <div className="p-1.5 bg-brand-accent/10 text-brand-accent rounded-lg shrink-0 mt-0.5">
                          <CalendarClock size={14} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <p className={`text-sm font-medium group-hover:text-brand-accent transition-colors ${isUnread ? 'text-white' : 'text-slate-300'}`}>{lead.name}</p>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-brand-accent mt-1.5"></span>}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">Follow-up scheduled for today.</p>
                        </div>
                      </button>
                    );
                  })}

                  {/* Real-time Event Notifications (Admin/Manager only) */}
                  {visibleEvents.map(ev => {
                    const isUnread = !readIds.includes(ev.id);
                    return (
                      <button 
                        key={ev.id} 
                        onClick={() => markAsReadAndNavigate(ev.id, getEventPath(ev.type))}
                        className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-start gap-3 group ${isUnread ? 'bg-white/5' : ''}`}
                      >
                        <div className="p-1.5 bg-white/5 rounded-lg shrink-0 mt-0.5">
                          {getEventIcon(ev.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <p className={`text-sm font-medium transition-colors ${isUnread ? 'text-white group-hover:text-brand-accent' : 'text-slate-300 group-hover:text-white'}`}>{ev.message}</p>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-brand-accent mt-1.5 shrink-0 ml-2"></span>}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {formatDistanceToNow(new Date(ev.timestamp.endsWith('Z') || ev.timestamp.includes('+') ? ev.timestamp : ev.timestamp + 'Z'), { addSuffix: true })}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {totalNotifications === 0 && (
                    <div className="px-4 py-6 text-center text-slate-400 text-sm">
                      <Bell size={24} className="mx-auto mb-2 opacity-20" />
                      No new notifications
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="relative ml-2">
            <button 
              onClick={() => { setDropdownOpen(!dropdownOpen); setNotificationsOpen(false); }}
              className="flex items-center gap-2 focus:outline-none transition-transform hover:scale-105"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-accent-dark to-brand-accent-light flex items-center justify-center border-2 border-brand-primary shadow-md shadow-brand-accent/20">
                <User size={18} className="text-brand-primary" />
              </div>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-3 w-56 glass-panel border border-white/10 rounded-xl shadow-2xl py-1 z-50 animate-fade-in-up">
                <div className="px-4 py-3 border-b border-white/5 bg-brand-primary-lighter/30">
                  <p className="text-sm font-bold text-white">{user?.name}</p>
                  <p className="text-xs text-brand-accent mt-0.5">{user?.email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{user?.role}</p>
                </div>
                <button 
                  onClick={() => { setDropdownOpen(false); navigate(user?.role === 'Admin' ? '/settings' : '/profile'); }}
                  className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5"
                >
                  <User size={16} className="text-brand-accent" />
                  {user?.role === 'Admin' ? 'Settings' : 'My Profile'}
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 flex items-center gap-3 transition-colors rounded-b-xl"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;

