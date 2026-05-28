import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AIAssistantWidget from './AIAssistantWidget';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { isToday, parseISO } from 'date-fns';
import { Bell, X, CalendarClock, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';

const Layout = () => {
  const { leads } = useData();
  const { user, canAccessData } = useAuth();
  const [showToast, setShowToast] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [dueLeadsCount, setDueLeadsCount] = useState(0);
  const location = useLocation();
  const scrollRef = useRef(null);

  // Scroll to top on route change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (user && leads.length > 0) {
      // Find leads assigned to the user that are due today
      const dueToday = leads.filter(l => {
        if (user.role !== 'Sales') return false; // Hide follow-ups from Admin/Manager
        if (!canAccessData(l.assignedTo)) return false;
        if (!l.followUpDate) return false;
        // The mock data followUpDate is an ISO string, but might be adjusted dynamically
        try {
          return isToday(new Date(l.followUpDate)) && l.status !== 'Converted' && l.status !== 'Lost';
        } catch(e) { return false; }
      });
      
      if (dueToday.length > 0) {
        setDueLeadsCount(dueToday.length);
        // Add a slight delay so it pops up beautifully after page load
        const timerId = setTimeout(() => setShowToast(true), 1000);
        
        // Auto dismiss after 8 seconds
        const dismissId = setTimeout(() => setShowToast(false), 9000);
        
        return () => {
          clearTimeout(timerId);
          clearTimeout(dismissId);
        };
      }
    }
  }, [user, leads]);

  return (
    <div className="flex h-screen overflow-hidden bg-brand-primary relative">
      {/* Ambient background glows — PRISMORA brand magenta */}
      <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] rounded-full bg-brand-accent/8 blur-[140px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-900/15 blur-[130px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2.5s' }}></div>
      
      <Sidebar />
      <div 
        ref={scrollRef}
        className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar z-10"
      >
        <Topbar />
        <main className="p-6 md:p-8 animate-fade-in-up">
          <Outlet />
        </main>
      </div>

      {/* Global Toast Notification */}
      {showToast && createPortal(
        <div className="fixed top-20 right-6 z-[200] animate-fade-in-up">
          <div className="glass-panel bg-brand-primary/95 border border-brand-accent/30 rounded-xl p-4 shadow-2xl shadow-brand-accent/10 flex items-start gap-4 min-w-[300px] max-w-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand-accent"></div>
            <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
              <CalendarClock size={24} className="animate-pulse" />
            </div>
            <div className="flex-1 pr-6">
              <h4 className="text-white font-bold text-sm mb-1">Follow-ups Due Today!</h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                You have <strong className="text-brand-accent">{dueLeadsCount}</strong> lead{dueLeadsCount > 1 ? 's' : ''} scheduled for follow-up today. Check your Leads board!
              </p>
            </div>
            <button 
              onClick={() => setShowToast(false)}
              className="absolute top-2 right-2 text-slate-500 hover:text-white transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Global AI Chatbot Widget */}
      {isChatOpen && <AIAssistantWidget onClose={() => setIsChatOpen(false)} />}

      {/* Floating round chat button - bottom right */}
      {user?.role === 'Admin' && (
        <button
          onClick={() => setIsChatOpen(prev => !prev)}
          className="fixed bottom-6 right-6 z-[99] w-14 h-14 rounded-full bg-gradient-to-br from-brand-accent to-brand-accent-dark shadow-lg shadow-brand-accent/40 flex items-center justify-center hover:scale-110 transition-transform border-2 border-brand-accent/30"
          title="AI Assistant"
        >
          <div className="absolute inset-0 rounded-full bg-brand-accent/30 blur-md animate-pulse-slow"></div>
          <Sparkles size={22} className="relative z-10 text-white" />
        </button>
      )}
    </div>
  );
};

export default Layout;

