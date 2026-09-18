import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';

/**
 * Asking and telling, without the browser's own dialogs.
 *
 * There were thirty-two window.confirm and window.alert calls across the app.
 * They block the whole page while open, cannot be styled, put the site's
 * hostname in the title bar, and on a phone look close enough to a browser
 * security warning that people dismiss them without reading. For a confirm
 * guarding a delete, dismissing without reading is the whole problem.
 *
 * confirm() returns a promise, so a call site changes from
 *
 *   if (confirm('Delete?')) remove(id);
 * to
 *   if (await confirm({ title: 'Delete?' })) remove(id);
 *
 * which keeps the shape of the code that was already there.
 *
 * Deliberately not the notification bell: that is a feed someone reads later,
 * and "Saved" does not belong in it.
 */

const DialogContext = createContext(null);

const TOAST_MS = 4000;

const TONE = {
  info: { icon: Info, ring: 'border-white/10', text: 'text-slate-200' },
  success: { icon: CheckCircle, ring: 'border-emerald-500/30', text: 'text-emerald-300' },
  error: { icon: XCircle, ring: 'border-rose-500/30', text: 'text-rose-300' },
};

export const DialogProvider = ({ children }) => {
  const [ask, setAsk] = useState(null);      // the open question, or null
  const [toasts, setToasts] = useState([]);
  const resolver = useRef(null);
  const nextId = useRef(0);

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { title: options } : (options || {});
    return new Promise(resolve => {
      resolver.current = resolve;
      setAsk({
        title: opts.title || 'Are you sure?',
        body: opts.body || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: !!opts.danger,
      });
    });
  }, []);

  const settle = useCallback((answer) => {
    setAsk(null);
    // Cleared first: a second click while the promise is settling would
    // otherwise resolve the same question twice.
    const resolve = resolver.current;
    resolver.current = null;
    if (resolve) resolve(answer);
  }, []);

  const toast = useCallback((message, tone = 'info') => {
    if (!message) return;
    const id = ++nextId.current;
    setToasts(list => [...list, { id, message: String(message), tone }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), TOAST_MS);
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}

      {ask && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Clicking away is the same as cancelling, which is the safe answer. */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => settle(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl border border-white/10 shadow-2xl animate-fade-in-up z-10 p-6">
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                ask.danger ? 'bg-rose-500/10 text-rose-400' : 'bg-brand-accent/10 text-brand-accent'
              }`}>
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white leading-snug">{ask.title}</h3>
                {ask.body && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{ask.body}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => settle(false)}
                className="h-10 px-4 rounded-xl text-xs font-bold border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition-colors"
              >
                {ask.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={`h-10 px-4 rounded-xl text-xs font-bold transition-colors ${
                  ask.danger
                    ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                    : 'btn-accent border border-transparent'
                }`}
              >
                {ask.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {toasts.length > 0 && createPortal(
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[310] flex flex-col items-center gap-2 px-4 w-full max-w-md">
          {toasts.map(t => {
            const { icon: Icon, ring, text } = TONE[t.tone] || TONE.info;
            return (
              <div
                key={t.id}
                role="status"
                className={`glass-panel bg-brand-primary w-full rounded-xl border ${ring} px-4 py-3 shadow-2xl animate-fade-in-up flex items-start gap-2.5`}
              >
                <Icon size={15} className={`${text} flex-shrink-0 mt-0.5`} />
                <p className="text-xs text-slate-200 leading-relaxed flex-1 min-w-0">{t.message}</p>
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => setToasts(list => list.filter(x => x.id !== t.id))}
                  className="text-slate-500 hover:text-white flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </DialogContext.Provider>
  );
};

/**
 * Falls back to the browser's own dialogs when no provider is mounted.
 *
 * Nothing should render outside the provider, but a confirm that silently
 * returns false would delete nothing and say nothing, and that is a worse
 * failure than an ugly dialog.
 */
export const useDialogs = () => useContext(DialogContext) || {
  confirm: async (o) => window.confirm(typeof o === 'string' ? o : (o?.title || 'Are you sure?')),
  toast: (m) => window.alert(m),
};

export const useConfirm = () => useDialogs().confirm;
export const useToast = () => useDialogs().toast;
