import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowRight, Lock, UserPlus, ChevronDown, Truck, Store, ShoppingBag } from 'lucide-react';
import useDismiss from '../hooks/useDismiss';

// One way in for a new partner, which then asks what kind. Signing in is the
// same for everyone — the account's role decides where it lands — so the only
// choice on this page is which signup form a newcomer needs.
const PARTNER_SIGNUPS = [
  { to: '/register-distributor', label: 'Distributor', hint: 'Buys from us and supplies dealers', icon: Truck },
  { to: '/register-dealer', label: 'Dealer', hint: 'Buys from a distributor, supplies retailers', icon: Store },
  { to: '/register-retailer', label: 'Retailer', hint: 'A shop selling to customers', icon: ShoppingBag },
];

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, missingEnvVars } = useAuth();
  const navigate = useNavigate();
  const [registerOpen, setRegisterOpen] = useState(false);
  const registerRef = useRef(null);
  useDismiss([registerRef], registerOpen, () => setRegisterOpen(false));

  const handleLogin = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result === true) {
      navigate('/');
    } else if (result === 'pending') {
      setError('Your account is awaiting admin approval. Please check back soon.');
    } else if (result === 'rejected') {
      setError('Your registration was not approved. Please contact support.');
    } else if (result === 'unconfigured') {
      setError(
        'This site was built without its database keys (' + (missingEnvVars || []).join(', ') +
        '). Nothing can sign in until they are set and the site is redeployed. This is not your password.'
      );
    } else if (result === 'unconfirmed') {
      setError('This account exists but its email has not been confirmed. An administrator can confirm it in Supabase → Authentication → Users.');
    } else if (typeof result === 'string' && result.startsWith('no-profile:')) {
      // Says which of the two it was, on screen. "Could not be read" and "is not
      // there" need opposite fixes, and telling them apart used to mean opening
      // the console.
      const [, why, who] = result.split(':');
      setError(
        why === 'read-blocked'
          ? 'Your password was accepted, but the app could not read your profile — the database refused the request. This is a permissions problem, not a password one. (' + who + ')'
          : 'Your password was accepted, but there is no profile for ' + who + ' in the system, so it has no role. An administrator needs to add it.'
      );
    } else if (typeof result === 'string' && result.startsWith('error:')) {
      // The real message, rather than blaming the password for a problem that
      // has nothing to do with it.
      setError('Could not sign in: ' + result.slice(6));
    } else {
      setError('Invalid email address or password. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-svh flex justify-center bg-brand-primary relative overflow-x-hidden py-8">

      {/* Ambient Animated Background — PRISMORA magenta */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-accent/20 blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-900/25 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-brand-accent-dark/10 blur-[100px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '4s' }}></div>

      {/* Decorative Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utb3BhY2l0eT0iMC4wMyIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTAgNjBoNjBNNjAgMHY2MCIvPjwvZz48L3N2Zz4=')] pointer-events-none"></div>

      <div className="relative z-10 my-auto w-full max-w-[420px] px-6">

        {/* Logo Section */}
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in-up -mt-6 sm:-mt-12">
          <img src="/logo.png" alt="PRISMORA Logo" className="w-44 sm:w-56 md:w-64 h-auto -mt-12 -mb-12 sm:-mt-16 sm:-mb-16 relative z-10 pointer-events-none" />
          <p className="text-slate-400 text-center text-sm relative z-20">Enterprise Sales Intelligence</p>
        </div>

        {/* Login Card */}
        <div className="glass-panel p-6 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">Welcome back</h2>

          {/* Said before anyone types, rather than after — a build with no keys
              cannot sign anybody in, and that is not a password problem. */}
          {missingEnvVars && missingEnvVars.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-[11px] text-amber-300 leading-relaxed">
                <span className="font-bold">This site is missing its database keys.</span>{' '}
                {missingEnvVars.join(' and ')} {missingEnvVars.length > 1 ? 'were' : 'was'} not set when it was built,
                so no account can sign in. They are set in the hosting project's environment variables, and the site
                must be redeployed afterwards.
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="login-email-address" className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail size={16} />
                </div>
                <input id="login-email-address"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="glass-input w-full h-11 pl-9 pr-3.5 text-sm"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="glass-input w-full h-11 pl-9 pr-3.5 text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-xs mt-1.5 font-medium animate-fade-in-up">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full btn-accent font-bold rounded-xl h-11 px-4 inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-accent/30 text-white"
            >
              Sign In to Dashboard <ArrowRight size={18} />
            </button>
          </form>

          <div className="relative mt-5 flex justify-center" ref={registerRef}>
            <button
              type="button"
              onClick={() => setRegisterOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={registerOpen}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-accent font-medium px-3 py-1.5 rounded-lg hover:bg-brand-accent/5 transition-colors"
            >
              <UserPlus size={14} />
              New partner? <span className="text-brand-accent">Register</span>
              <ChevronDown size={13} className={`transition-transform ${registerOpen ? 'rotate-180' : ''}`} />
            </button>
            {registerOpen && (
              <div role="menu" className="absolute top-full mt-2 w-64 menu-panel rounded-xl py-1.5 z-30 animate-fade-in-up">
                <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Register as a…</p>
                {PARTNER_SIGNUPS.map(({ to, label, hint, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    role="menuitem"
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-brand-accent/10 transition-colors"
                  >
                    <Icon size={15} className="text-brand-accent mt-0.5 flex-shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold text-white">{label}</span>
                      <span className="block text-[11px] text-slate-500">{hint}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          © {new Date().getFullYear()} Janki Herbals Pvt. Ltd.<br />All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;

