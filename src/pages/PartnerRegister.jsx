import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft } from 'lucide-react';

// Where a new partner starts: pick what kind of partner you are, then the
// form for that kind. Signing in is the same for everyone, so this is the only
// choice the sign-in page hands off.
const PARTNER_TYPES = [
  { value: 'distributor', label: 'Distributor', hint: 'Buys from us and supplies dealers in your area.', to: '/register-distributor' },
  { value: 'dealer', label: 'Dealer', hint: 'Buys from a distributor and supplies retailers.', to: '/register-dealer' },
  { value: 'retailer', label: 'Retailer', hint: 'A shop or pharmacy selling to customers.', to: '/register-retailer' },
];

export default function PartnerRegister() {
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const chosen = PARTNER_TYPES.find(t => t.value === type);

  const proceed = (e) => {
    e.preventDefault();
    if (chosen) navigate(chosen.to);
  };

  return (
    <div className="min-h-svh flex justify-center bg-brand-primary relative overflow-x-hidden py-10">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-accent/20 blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-900/25 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 my-auto w-full max-w-[440px] px-6">
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in-up -mt-6">
          <img src="/logo.png" alt="PRISMORA Logo" className="w-56 h-auto -mt-14 -mb-14 relative z-10 pointer-events-none" />
          <p className="text-slate-400 text-center text-sm relative z-20">Partner Registration</p>
        </div>

        <form onSubmit={proceed} className="glass-panel p-6 rounded-3xl animate-fade-in-up space-y-5" style={{ animationDelay: '0.1s' }}>
          <div>
            <h2 className="text-xl font-semibold text-white">Register as a partner</h2>
            <p className="text-sm text-slate-400 mt-1">Choose what kind of partner you are, then fill in your details.</p>
          </div>

          <div>
            <label htmlFor="partner-type" className="block text-sm font-medium text-slate-300 mb-1.5">I am registering as a</label>
            <select
              id="partner-type"
              required
              value={type}
              onChange={e => setType(e.target.value)}
              className="glass-input w-full h-11 px-3.5 text-sm"
            >
              <option value="" disabled>Select partner type…</option>
              {PARTNER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {chosen && <p className="text-xs text-slate-400 mt-1.5">{chosen.hint}</p>}
          </div>

          <button
            type="submit"
            disabled={!chosen}
            className="w-full btn-accent font-bold rounded-xl h-11 px-4 inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-accent/30 text-white disabled:opacity-50 disabled:hover:scale-100"
          >
            {chosen ? `Continue as ${chosen.label}` : 'Continue'} <ArrowRight size={18} />
          </button>

          <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={12} /> Back to Sign In
          </Link>
        </form>
      </div>
    </div>
  );
}
