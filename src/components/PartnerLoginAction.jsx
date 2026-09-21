import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Check, Copy, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/DialogContext';
import { IconButton } from './ui';
import {
  PARTNER_LOGIN_KINDS, existingLogin, canCreateLogin, generatePassword, loginPayload,
} from '../utils/partnerLogin';

/**
 * The button that gives a partner a way into their own portal.
 *
 * Adding a distributor wrote one row and never asked for a password, so a
 * partner onboarded from this screen could not sign in at all — the only thing
 * that ever created a working partner login was the public signup form. This is
 * the other half of that: the same three records, made by somebody who is
 * already signed in.
 *
 * One component for all three partner types, because the only difference
 * between them is which column the profile points through.
 *
 * The password is generated rather than typed. An administrator onboarding
 * twenty partners reuses one password across all of them, and a password
 * agreed over a phone call is chosen to be easy to say out loud. It is shown
 * once — Supabase stores a hash, so nothing here can show it again later.
 */
export default function PartnerLoginAction({ kind, partner, canManage }) {
  const { users, createUserAccount } = useAuth();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const spec = PARTNER_LOGIN_KINDS[kind];
  if (!spec || !canManage) return null;

  const already = existingLogin(kind, partner, users);

  const start = () => {
    const check = canCreateLogin(kind, partner, users);
    if (!check.ok) {
      // The reason names the next action — approve the partner, add an email —
      // so a toast is enough and a dialog would be in the way.
      toast(check.reason, already ? 'success' : 'error');
      return;
    }
    setPassword(generatePassword());
    setCreated(false);
    setCopied(false);
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access is refused over plain http and in some embedded
      // browsers. The password is on screen either way, which is why it is
      // shown as selectable text rather than only behind this button.
      toast('Could not copy automatically — select the password and copy it.', 'error');
    }
  };

  const create = async () => {
    setWorking(true);
    const result = await createUserAccount(loginPayload(kind, partner, password));
    setWorking(false);

    if (!result.ok) {
      toast(result.needsDeploy
        ? 'The create-user function has not been deployed, so the login could not be made.'
        : 'Could not create the login: ' + result.error, 'error');
      return;
    }
    // Deliberately stays open. Closing on success would take the password off
    // the screen at the moment it is needed, and it cannot be shown again.
    setCreated(true);
  };

  return (
    <>
      <IconButton
        icon={already ? Check : KeyRound}
        title={already ? `Portal login: ${already.email}` : 'Create portal login'}
        size="sm"
        tone={already ? 'success' : undefined}
        onClick={start}
      />

      {open && createPortal(
        <div className="fixed inset-0 z-[220] flex items-start justify-center p-4 pt-[12vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !working && setOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-white/5">
              <h3 className="text-base font-bold text-white">
                {created ? 'Login created' : `Create portal login`}
              </h3>
              <button onClick={() => !working && setOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                {created
                  ? <>They can sign in now. Send them the password below — it cannot be shown again.</>
                  : <><strong className="text-white">{partner.name}</strong> will be able to sign in to their {spec.label} portal.</>}
              </p>

              <div className="space-y-2">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Email</span>
                  <p className="text-sm text-white break-all">{partner.email}</p>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Password</span>
                  <div className="flex items-center gap-2">
                    {/* Selectable text, not only a copy button: clipboard access
                        is refused over plain http and in some embedded browsers,
                        and the password has to be readable either way. */}
                    <code className="flex-1 select-all font-mono text-base tracking-wide text-white bg-black/30 border border-white/10 rounded-lg px-3 py-2">
                      {password}
                    </code>
                    <IconButton icon={copied ? Check : Copy} size="sm"
                      tone={copied ? 'success' : 'accent'}
                      title={copied ? 'Copied' : 'Copy password'} onClick={copy} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 items-start text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
                <span>
                  Shown once. Nothing can display it again — if it is lost, the password has to be
                  reset from the Supabase dashboard.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 pt-0">
              {created ? (
                <button onClick={() => setOpen(false)}
                  className="btn-accent font-bold rounded-xl h-10 px-5 text-sm text-white">
                  Done
                </button>
              ) : (
                <>
                  <button onClick={() => setOpen(false)} disabled={working}
                    className="rounded-xl h-10 px-4 text-sm text-slate-300 hover:text-white disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={create} disabled={working}
                    className="btn-accent font-bold rounded-xl h-10 px-5 text-sm text-white disabled:opacity-50">
                    {working ? 'Creating…' : 'Create login'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
