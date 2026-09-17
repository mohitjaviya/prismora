import { useState } from 'react';
import { supabase, isConfigured, missingEnvVars, supabaseProjectUrl } from '../supabaseClient';

/**
 * A throwaway page that runs the sign-in sequence one step at a time and shows
 * where it stops.
 *
 * The normal login screen can only report what login() returns, and the fault
 * being chased is one where it returns nothing at all — no error, no
 * navigation, nothing to photograph. Each step here is timed and bounded, so a
 * step that never finishes shows as a timeout against its own name instead of
 * an empty screen.
 *
 * Delete this route once sign-in is settled. It is a diagnostic, not a feature.
 */

// Nothing here may hang. Every await is raced against a deadline so the page
// always has something to display.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    Promise.resolve(promise).then(
      value => ({ value }),
      error => ({ error: error?.message || String(error) })
    ),
    new Promise(resolve => setTimeout(() => resolve({ timedOut: true, label }), ms)),
  ]);

export default function Diagnose() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);

  const push = (name, status, detail) =>
    setSteps(prev => [...prev, { name, status, detail, at: Date.now() }]);

  const run = async (e) => {
    e.preventDefault();
    setSteps([]);
    setRunning(true);
    const t0 = Date.now();
    const ms = () => String(Date.now() - t0).padStart(5) + 'ms';

    push('Build configuration', isConfigured ? 'ok' : 'fail',
      isConfigured ? 'Project: ' + supabaseProjectUrl : 'Missing: ' + missingEnvVars.join(', '));

    // 1. Clear anything left over, so the run starts from a known state.
    const out = await withTimeout(supabase.auth.signOut(), 8000, 'signOut');
    push('1. Sign out any existing session', out.timedOut ? 'timeout' : 'ok', ms());

    // 2. The password check itself.
    const signIn = await withTimeout(
      supabase.auth.signInWithPassword({ email: email.trim(), password }), 15000, 'signInWithPassword');
    if (signIn.timedOut) {
      push('2. signInWithPassword', 'timeout', 'never came back after 15s — ' + ms());
      setRunning(false); return;
    }
    if (signIn.error) {
      push('2. signInWithPassword', 'fail', signIn.error + ' — ' + ms());
      setRunning(false); return;
    }
    const authError = signIn.value?.error;
    if (authError) {
      push('2. signInWithPassword', 'fail', authError.message + ' — ' + ms());
      setRunning(false); return;
    }
    const signedInEmail = signIn.value?.data?.user?.email;
    push('2. signInWithPassword', signedInEmail ? 'ok' : 'fail',
      (signedInEmail ? 'accepted, user ' + signedInEmail : 'returned no user') + ' — ' + ms());
    if (!signedInEmail) { setRunning(false); return; }

    // 3. Is the token actually attached to the client now?
    const sess = await withTimeout(supabase.auth.getSession(), 10000, 'getSession');
    if (sess.timedOut) {
      push('3. getSession', 'timeout', 'never came back after 10s — this is a lock deadlock — ' + ms());
      setRunning(false); return;
    }
    const token = sess.value?.data?.session?.access_token;
    push('3. getSession', token ? 'ok' : 'fail',
      (token ? 'access token present (' + token.length + ' chars)' : 'NO access token') + ' — ' + ms());

    // 4. The read that the real login does next.
    const read = await withTimeout(
      supabase.from('users').select('id,email,role,status').ilike('email', signedInEmail).maybeSingle(),
      15000, 'users read');
    if (read.timedOut) {
      push('4. Read your profile from users', 'timeout',
        'never came back after 15s — THIS is where sign-in stops — ' + ms());
      setRunning(false); return;
    }
    const rerr = read.value?.error;
    const row = read.value?.data;
    if (rerr) {
      push('4. Read your profile from users', 'fail', rerr.message + ' — ' + ms());
    } else if (!row) {
      push('4. Read your profile from users', 'fail',
        'no error, but no row for ' + signedInEmail + ' — row-level security refused it, or the address differs from the one in the users table — ' + ms());
    } else {
      push('4. Read your profile from users', 'ok',
        row.role + ' / ' + row.status + ' (id ' + row.id + ') — ' + ms());
      if (row.status !== 'Active') {
        push('5. Account status', 'fail', 'status is "' + row.status + '", so sign-in stops here');
      } else {
        push('5. Account status', 'ok', 'Active — a real sign-in would now open the dashboard');
      }
    }

    await withTimeout(supabase.auth.signOut(), 8000, 'final signOut');
    push('Signed back out', 'ok', 'this page does not keep you logged in');
    setRunning(false);
  };

  const colour = (s) =>
    s === 'ok' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : s === 'timeout' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
        : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  return (
    <div className="min-h-svh bg-brand-primary p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-1">Sign-in diagnostic</h1>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Runs the sign-in sequence one step at a time and shows where it stops. Your password is used
          only against Supabase, exactly as the login page uses it, and this page signs you out again
          at the end.
        </p>

        <form onSubmit={run} className="glass-panel rounded-2xl p-5 space-y-3 mb-5">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="admin@prismora.com"
            className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600" />
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="your password"
            className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600" />
          <button type="submit" disabled={running}
            className="w-full btn-accent font-bold rounded-xl px-4 py-2.5 text-white disabled:opacity-50">
            {running ? 'Running…' : 'Run the test'}
          </button>
        </form>

        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className={'rounded-xl border p-3 ' + colour(s.status)}>
              <p className="text-xs font-bold">{s.name} — {s.status.toUpperCase()}</p>
              {s.detail && <p className="text-[11px] mt-1 text-slate-300 break-words">{s.detail}</p>}
            </div>
          ))}
          {steps.length === 0 && !running && (
            <p className="text-xs text-slate-500 text-center py-6">No run yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
