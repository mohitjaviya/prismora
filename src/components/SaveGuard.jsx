import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useToast } from '../context/DialogContext';
import { subscribe, clearAbandoned } from '../utils/writeJournal';

/**
 * A save never vanishes silently (B07).
 *
 * The journal already stops a close or reload while a save is on its way
 * (the browser asks first). If the person leaves anyway, the next page load
 * lists what had not finished, so they can check it. A save that fails after
 * its own form or page has gone is announced wherever they are now.
 */
export default function SaveGuard() {
  const toast = useToast();
  const [abandoned, setAbandoned] = useState([]);

  useEffect(() => subscribe((event) => {
    if (event.type === 'abandoned') setAbandoned(event.list || []);
    if (event.type === 'failed') toast(`Not saved: ${event.label}.${event.error ? ` ${event.error}` : ''}`, 'error');
  }), [toast]);

  if (!abandoned.length) return null;
  const dismiss = () => { clearAbandoned(); setAbandoned([]); };
  const when = (iso) => { try { return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

  return (
    <div role="alert" id="save-guard-abandoned" className="fixed top-4 left-1/2 -translate-x-1/2 z-[320] w-full max-w-lg px-4">
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 text-amber-900 shadow-xl p-4 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">{abandoned.length === 1 ? 'A save may not have finished' : `${abandoned.length} saves may not have finished`}</p>
            <p className="mt-1">The page was closed or reloaded while {abandoned.length === 1 ? 'this was' : 'these were'} still saving. Check {abandoned.length === 1 ? 'it is' : 'they are'} there, and enter {abandoned.length === 1 ? 'it' : 'any missing one'} again if not:</p>
            <ul className="mt-2 space-y-1">
              {abandoned.map((a, i) => (
                <li key={i} className="font-medium">• {a.label} <span className="font-normal text-amber-700">— {when(a.startedAt)}{a.page ? `, on ${a.page}` : ''}</span></li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={dismiss} title="Dismiss" className="p-1 text-amber-700 hover:text-amber-900"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}
