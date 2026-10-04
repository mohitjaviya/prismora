import { useEffect, useState } from 'react';
import { AlertTriangle, Building2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/DialogContext';
import { INDIAN_STATES } from '../utils/gst';
import { FieldError, useFieldCheck } from './ui';
import { cleanForm } from '../utils/formRules';
import { gstinProblem, normaliseGstin } from '../utils/contactChecks';

// Gap 9: the shared input rules (utils/formRules.js); GSTIN as for partners.
const COMPANY_SPEC = {
  companyName: { label: 'Company name', required: true },
  gstin: { label: 'GSTIN', required: true },
  state: { label: 'State', required: true },
  email: { label: 'Billing email', kind: 'email' },
};
const gstinError = (f) => (gstinProblem(f.gstin) ? { gstin: gstinProblem(f.gstin) } : {});

const inputCls = 'w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 disabled:opacity-60';
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide';

/**
 * The seller printed on every invoice (D-17, company_settings).
 *
 * Invoices used to print a name and GSTIN written into the code. They now
 * record these values when issued, so changing them here affects invoices
 * raised from now on and never one already issued. Only an administrator may
 * save; the database refuses anyone else.
 */
export default function CompanySettingsPanel({ canEdit }) {
  const { companySettings, loadCompanySettings, updateCompanySettings } = useData();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const check = useFieldCheck();

  useEffect(() => { if (!companySettings) loadCompanySettings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (companySettings) setForm({ ...companySettings }); }, [companySettings]);

  if (!form) return <p className="text-sm text-slate-500">Loading company details…</p>;
  const errors = check.errors(form, COMPANY_SPEC, gstinError);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!check.ok(form, COMPANY_SPEC, gstinError)) return;
    const clean = cleanForm(form, COMPANY_SPEC);
    setSaving(true);
    const result = await updateCompanySettings({
      companyName: String(clean.companyName || ''),
      gstin: normaliseGstin(clean.gstin),
      state: clean.state,
      address: String(clean.address || '') || null,
      email: String(clean.email || '') || null,
      brandName: String(form.brandName || '').trim() || 'PRISMORA',
      brandTagline: String(form.brandTagline || '').trim(),
      jurisdiction: String(form.jurisdiction || '').trim(),
      isDemo: Boolean(form.isDemo),
    });
    setSaving(false);
    toast(result.ok ? 'Company details saved. Invoices raised from now on will carry them.' : result.error, result.ok ? 'success' : 'error');
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="glass-panel rounded-2xl overflow-hidden p-6 border border-white/5 max-w-2xl space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2"><Building2 size={18} className="text-brand-accent" />Company on invoices</h3>

      {companySettings.isDemo && (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">These are demo values.</span> Replace them with the company's registered name, GSTIN and
            state before issuing real invoices, and untick "Demo values" when you do.
          </span>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Printed on every invoice. Each invoice keeps the values it was issued with: saving here changes invoices raised
        from now on, never one already issued. Whether GST is CGST + SGST or IGST is decided by comparing this state with
        the customer's.
      </p>

      <form onSubmit={save} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="company-name" className={labelCls}>Company name</label>
          <input id="company-name" required disabled={!canEdit} value={form.companyName || ''} onChange={set('companyName')} className={inputCls} />
          <FieldError>{errors.companyName}</FieldError>
        </div>
        <div>
          <label htmlFor="company-gstin" className={labelCls}>GSTIN</label>
          <input id="company-gstin" required disabled={!canEdit} value={form.gstin || ''} onChange={set('gstin')} className={`${inputCls} font-mono uppercase`} />
          <FieldError>{errors.gstin}</FieldError>
        </div>
        <div>
          <label htmlFor="company-state" className={labelCls}>State</label>
          <select id="company-state" required disabled={!canEdit} value={form.state || ''} onChange={set('state')} className={inputCls}>
            {INDIAN_STATES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="company-address" className={labelCls}>Address (optional)</label>
          <input id="company-address" disabled={!canEdit} value={form.address || ''} onChange={set('address')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="company-brand" className={labelCls}>Brand (invoice heading)</label>
          <input id="company-brand" disabled={!canEdit} value={form.brandName || ''} onChange={set('brandName')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="company-tagline" className={labelCls}>Brand line</label>
          <input id="company-tagline" disabled={!canEdit} value={form.brandTagline || ''} onChange={set('brandTagline')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="company-jurisdiction" className={labelCls}>Jurisdiction (city, for invoice terms)</label>
          <input id="company-jurisdiction" disabled={!canEdit} value={form.jurisdiction || ''} onChange={set('jurisdiction')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="company-email" className={labelCls}>Billing email (optional)</label>
          <input id="company-email" type="email" disabled={!canEdit} value={form.email || ''} onChange={set('email')} className={inputCls} />
          <FieldError>{errors.email}</FieldError>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300 self-end pb-2">
          <input id="company-is-demo" type="checkbox" disabled={!canEdit} checked={Boolean(form.isDemo)} onChange={set('isDemo')} />
          Demo values
        </label>
        {canEdit ? (
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : 'Save company details'}</button>
          </div>
        ) : (
          <p className="sm:col-span-2 text-xs text-slate-500">Only an administrator can change these.</p>
        )}
      </form>
    </div>
  );
}
