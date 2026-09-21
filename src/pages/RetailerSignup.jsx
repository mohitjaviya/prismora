import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building2, Mail, Lock, User, Phone, MapPin, Network, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { STATE_DISTRICTS } from '../utils/indianStatesDistricts';
import { usePublicDirectory } from '../hooks/usePublicDirectory';
import { emailCheckVerdict } from '../utils/signupChecks';
import { validateSignup, successMessage } from '../utils/partnerSignup';
import { PUBLIC_VIEWS, partnerLabel, directoryMessage } from '../utils/publicDirectory';
import { territoryForPlace } from '../utils/territory';

const BLANK_FORM = {
  name: '', gstin: '', contactPerson: '', phone: '', email: '', password: '',
  state: '', city: '', parentDealerId: '',
  // Honeypot — see the field in the form below.
  website: ''
};

const RetailerSignup = () => {
  const { registerPartner, isEmailTaken } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmationNeeded, setConfirmationNeeded] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const districts = form.state ? (STATE_DISTRICTS[form.state] || []) : [];
  // Not from DataContext: it reads the dealers table, which returns zero rows
  // to a visitor who has no account -- so this dropdown was empty on a
  // required field for every real signup. The view filters to Active itself.
  const dealerList = usePublicDirectory(PUBLIC_VIEWS.dealers);
  const territoryList = usePublicDirectory(PUBLIC_VIEWS.territories);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Disabled before the round-trip, not after it. The check is a network
    // call now, and a live Submit button during it means a second click
    // starts a second signup for the same person.
    setSubmitting(true);

    // Refused here only to save a round-trip on a form somebody has visibly
    // not finished. The Edge Function validates all of it again, because
    // anything the browser decides can be skipped by not using the browser.
    const complete = validateSignup('retailer', form);
    if (!complete.ok) {
      setError(complete.error);
      setSubmitting(false);
      return;
    }

    // Asked of the database, not of a list. `users` is empty for a visitor
    // with no account, so this check used to pass for every address ever
    // typed — including ones that were already registered.
    const { block, error: takenError } = emailCheckVerdict(await isEmailTaken(form.email));
    if (block) {
      setError(takenError);
      setSubmitting(false);
      return;
    }
    // One call. It creates the login, the partner record and the profile, or
    // it creates none of them — the browser cannot do any of it, because no
    // policy grants an anonymous visitor INSERT on those tables.
    const result = await registerPartner('retailer', form);

    // The whole point of this rewrite. This used to be setSubmitted(true) with
    // nothing in front of it, so a write refused by row-level security showed
    // the same thank-you screen as one that saved.
    if (!result.ok) {
      setError(result.error || 'Something went wrong submitting your registration. Please try again.');
      setSubmitting(false);
      return;
    }

    setConfirmationNeeded(result.emailConfirmationRequired);
    setSubmitted(true);
    setSubmitting(false);
  };

  const inputCls = "w-full glass-input rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500";
  const labelCls = "block text-sm font-medium text-slate-300 mb-1.5";

  return (
    <div className="min-h-svh flex justify-center bg-brand-primary relative overflow-x-hidden py-10">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-accent/20 blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-900/25 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 my-auto w-full max-w-[520px] px-6">
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in-up -mt-6">
          <img src="/logo.png" alt="PRISMORA Logo" className="w-56 h-auto -mt-14 -mb-14 relative z-10 pointer-events-none" />
          <p className="text-slate-400 text-center text-sm relative z-20">Retailer Registration</p>
        </div>

        <div className="glass-panel p-6 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Registration submitted</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                {successMessage(form.name, { emailConfirmationRequired: confirmationNeeded })}
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full btn-accent font-bold rounded-xl h-11 px-4 inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] text-white shadow-lg shadow-brand-accent/30"
              >
                Back to Sign In <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl md:text-2xl font-semibold text-white mb-1">Register as a Retailer</h2>
              <p className="text-slate-500 text-xs mb-5">Submit your details for admin approval. You'll be notified once your account is active.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="retailersignup-business-name" className={labelCls}>Business Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Building2 size={16} /></div>
                    <input id="retailersignup-business-name" required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Geeta Retailers" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label htmlFor="retailersignup-parent-dealer" className={labelCls}>Parent Dealer *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Network size={16} /></div>
                    <select id="retailersignup-parent-dealer" required value={form.parentDealerId} onChange={e => setForm(f => ({ ...f, parentDealerId: e.target.value }))} className={inputCls}>
                      <option value="" className="bg-brand-primary text-slate-500">
                        {dealerList.loading || dealerList.failed || !dealerList.rows.length
                          ? directoryMessage({ ...dealerList, count: dealerList.rows.length, what: 'dealers' })
                          : '-- Select the Dealer you buy through --'}
                      </option>
                      {dealerList.rows.map(d => <option key={d.id} value={d.id} className="bg-brand-primary">{partnerLabel(d)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="retailersignup-gstin" className={labelCls}>GSTIN</label>
                    <input id="retailersignup-gstin" type="text" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACJ..." className="w-full glass-input h-11 px-3.5 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="retailersignup-contact-person" className={labelCls}>Contact Person *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><User size={16} /></div>
                      <input id="retailersignup-contact-person" required type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="retailersignup-phone" className={labelCls}>Phone *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Phone size={16} /></div>
                      <input id="retailersignup-phone" required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="retailersignup-email-address" className={labelCls}>Email Address *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Mail size={16} /></div>
                      <input id="retailersignup-email-address" required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="retailersignup-state" className={labelCls}>State *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><MapPin size={16} /></div>
                      <select id="retailersignup-state" required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, city: '' }))} className={inputCls}>
                        <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                        {Object.keys(STATE_DISTRICTS).map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="retailersignup-city-district" className={labelCls}>City / District *</label>
                    <select id="retailersignup-city-district" required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!form.state} className="w-full glass-input h-11 px-3.5 text-sm">
                      <option value="" className="bg-brand-primary text-slate-500">-- Select --</option>
                      {districts.map(d => <option key={d} value={d} className="bg-brand-primary">{d}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Territory / Zone</label>
                  {/* Not asked for any more. A distributor in Pune knows they
                      are in Pune; "Maharashtra Mega Zone" is an internal name
                      for how the sales team is organised. A territory already
                      lists the districts it covers and the form already asks
                      for the city, from the same list — so this is worked out
                      rather than guessed at by somebody who cannot know. */}
                  {(() => {
                    if (!form.state || !form.city) {
                      return <p className="text-sm text-slate-500 h-11 flex items-center">Choose a state and city first.</p>;
                    }
                    const { territory, ambiguous } = territoryForPlace(territoryList.rows, form);
                    if (territory) {
                      return (
                        <p className="text-sm text-emerald-400 h-11 flex items-center gap-1.5">
                          <MapPin size={14} />{form.city} is in {territory.name}
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-amber-400 min-h-11 flex items-center">
                        {ambiguous
                          ? `More than one territory covers ${form.city}. Our team will confirm which on approval.`
                          : `${form.city} is not inside a territory yet. Our team will assign one on approval.`}
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label htmlFor="retailersignup-password" className={labelCls}>Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Lock size={16} /></div>
                    <input id="retailersignup-password" required minLength={6} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className={inputCls} />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs font-medium animate-fade-in-up">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full btn-accent font-bold rounded-xl h-11 px-4 inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-accent/30 disabled:opacity-60 text-white"
                >
                  {submitting ? 'Submitting...' : 'Submit Registration'} <ArrowRight size={18} />
                </button>

                <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors pt-1">
                  <ArrowLeft size={12} /> Back to Sign In
                </Link>
                {/* Honeypot. Off-screen, unlabelled, not focusable and never
                    autofilled, so nothing a person does puts anything in it —
                    automated form-fillers populate every input they find. The
                    Edge Function answers a filled one with an ordinary-looking
                    success and creates nothing. aria-hidden keeps it away from
                    a screen reader, which is a person.

                    Last child, not first: `space-y-4` margins every child after
                    the first, so putting it at the top pushed the real first
                    field down by a rem. Positioned inline rather than by class
                    so no ancestor's layout and no CSS purge can bring it back
                    on screen. */}
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
                />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetailerSignup;
