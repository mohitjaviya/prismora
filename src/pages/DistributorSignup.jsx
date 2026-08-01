import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Building2, Mail, Lock, User, Phone, MapPin, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { STATE_DISTRICTS } from '../utils/indianStatesDistricts';

const BLANK_FORM = {
  name: '', gstin: '', contactPerson: '', phone: '', email: '', password: '',
  state: '', city: '', territory: ''
};

const DistributorSignup = () => {
  const { addUser, users } = useAuth();
  const { addDistributor } = useData();
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const districts = form.state ? (STATE_DISTRICTS[form.state] || []) : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (users.some(u => u.email.toLowerCase() === form.email.toLowerCase())) {
      setError('An account with this email already exists.');
      return;
    }

    setSubmitting(true);
    try {
      const distId = await addDistributor({
        name: form.name,
        gstin: form.gstin,
        state: form.state,
        city: form.city,
        territory: form.territory,
        phone: form.phone,
        email: form.email,
        contactPerson: form.contactPerson,
        outstandingAmount: 0,
        creditLimit: 100000,
        status: 'Pending'
      });

      await addUser({
        name: form.contactPerson,
        email: form.email,
        password: form.password,
        role: 'Distributor',
        status: 'Pending',
        distributorId: distId,
        managedUsers: []
      });

      setSubmitted(true);
    } catch {
      setError('Something went wrong submitting your registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full glass-input rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500";
  const labelCls = "block text-sm font-medium text-slate-300 mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-primary relative overflow-hidden py-10">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-accent/20 blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-900/25 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 w-full max-w-[520px] px-6">
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in-up -mt-6">
          <img src="/logo.png" alt="PRISMORA Logo" className="w-56 h-auto -mt-14 -mb-14 relative z-10 pointer-events-none" />
          <p className="text-slate-400 text-center text-sm relative z-20">Distributor Registration</p>
        </div>

        <div className="glass-panel p-6 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Registration submitted</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Thanks — your distributor account for <strong className="text-white">{form.name}</strong> is now under review.
                You'll be able to sign in once an administrator approves it.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-white text-brand-primary hover:bg-slate-200 font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Back to Sign In <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl md:text-2xl font-semibold text-white mb-1">Register as a Distributor</h2>
              <p className="text-slate-500 text-xs mb-5">Submit your details for admin approval. You'll be notified once your account is active.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={labelCls}>Business Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Building2 size={16} /></div>
                    <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gujarat Super Stockist" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>GSTIN</label>
                    <input type="text" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACJ..." className="w-full glass-input rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500" />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Person *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><User size={16} /></div>
                      <input required type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Phone *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Phone size={16} /></div>
                      <input required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Email Address *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Mail size={16} /></div>
                      <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>State *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><MapPin size={16} /></div>
                      <select required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, city: '' }))} className={inputCls}>
                        <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                        {Object.keys(STATE_DISTRICTS).map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>City / District *</label>
                    <select required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!form.state} className="w-full glass-input rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-50">
                      <option value="" className="bg-brand-primary text-slate-500">-- Select --</option>
                      {districts.map(d => <option key={d} value={d} className="bg-brand-primary">{d}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Territory / Zone (optional)</label>
                  <input type="text" value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} placeholder="Admin will confirm this on approval" className="w-full glass-input rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500" />
                </div>

                <div>
                  <label className={labelCls}>Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Lock size={16} /></div>
                    <input required minLength={6} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className={inputCls} />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs font-medium animate-fade-in-up">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-white text-brand-primary hover:bg-slate-200 font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/10 disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Registration'} <ArrowRight size={18} />
                </button>

                <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors pt-1">
                  <ArrowLeft size={12} /> Back to Sign In
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DistributorSignup;
