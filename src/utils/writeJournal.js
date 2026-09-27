/**
 * A journal of saves, so one that goes nowhere leaves a trace.
 *
 * Two saves in testing vanished without an error — a delivery whose form
 * stayed open, an invoice whose form closed — and nothing recorded either.
 * Every save now opens an entry here and closes it with its result. One that
 * fails, takes longer than SLOW_MS, or is still open when the page closes is
 * reported to client_write_log (042) with the page, how long after sign-in it
 * happened and the last few things the app did — enough to tell a slow
 * network from a sign-in race from a page that reloaded mid-save.
 *
 * The pure parts (what to report, and the entry shape) are separate from the
 * sending, so they can be tested without a browser or a database.
 */

export const SLOW_MS = 4000;
const RECENT = 12;
const PENDING_KEY = 'prismoraDiag_pendingWrites'; // not prismora_*, so sign-out does not clear it

/** What, if anything, a finished save should be reported as. */
export function reportKind({ ok, durationMs }) {
  if (!ok) return 'failed';
  if (durationMs > SLOW_MS) return 'slow';
  return null;
}

/** The row sent to client_write_log. */
export function reportRow({ kind, label, durationMs, error, page, sinceSignInMs, recent, build }) {
  return {
    kind,
    label: String(label || 'unknown save').slice(0, 200),
    duration_ms: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    error: error ? String(error).slice(0, 1000) : null,
    page: page || null,
    since_sign_in_ms: Number.isFinite(sinceSignInMs) ? Math.round(sinceSignInMs) : null,
    recent: (recent || []).slice(-RECENT),
    app_build: build || null,
  };
}

// ── The running journal (browser only) ──────────────────────────────────
const state = {
  send: null,            // (row) => Promise — set by the data layer
  signedInAt: null,
  recent: [],
  pending: new Map(),
  seq: 0,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const page = () => (typeof location !== 'undefined' ? location.pathname : null);
const build = () => (typeof document !== 'undefined'
  ? (document.querySelector('script[type=module][src*="assets/index-"]')?.getAttribute('src') || 'dev') : null);

function remember(entry) {
  state.recent.push({ t: new Date().toISOString(), ...entry });
  if (state.recent.length > RECENT) state.recent.shift();
  if (typeof window !== 'undefined') window.__prismoraWriteLog = state.recent;
}

function savePending() {
  try {
    const list = [...state.pending.values()].map(p => ({ label: p.label, startedAt: p.startedAt, page: p.page, sinceSignInMs: p.sinceSignInMs }));
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify({ list, recent: state.recent }));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* storage blocked */ }
}

function report(fields) {
  const row = reportRow({ ...fields, recent: fields.recent || state.recent, build: build() });
  console.warn(`[Prismora] save ${row.kind}: ${row.label}`, row);
  if (state.send) Promise.resolve(state.send(row)).catch(() => { /* the journal must never break a save */ });
}

/** Note something that is not a save but may explain one (sign-in, a data load). */
export function noteEvent(what, detail) {
  remember({ event: what, ...(detail ? { detail: String(detail).slice(0, 120) } : {}) });
  if (what === 'signed-in') state.signedInAt = now();
}

/** Open an entry for a save. Returns a token for finishWrite. */
export function startWrite(label) {
  const token = ++state.seq;
  state.pending.set(token, {
    label, start: now(), startedAt: new Date().toISOString(), page: page(),
    sinceSignInMs: state.signedInAt === null ? null : now() - state.signedInAt,
  });
  remember({ start: label });
  savePending();
  return token;
}

/** Close an entry with its result, reporting it if it failed or was slow. */
export function finishWrite(token, { ok, error } = {}) {
  const p = state.pending.get(token);
  if (!p) return;
  state.pending.delete(token);
  savePending();
  const durationMs = now() - p.start;
  remember({ end: p.label, ok: Boolean(ok), ms: Math.round(durationMs) });
  const kind = reportKind({ ok, durationMs });
  if (kind) report({ kind, label: p.label, durationMs, error: error?.message || error, page: p.page, sinceSignInMs: p.sinceSignInMs });
}

/**
 * Wrap an async save: journal it, and pass its result straight through.
 * The app's saves report failure as false, null, or { ok: false, error }.
 */
export async function journaled(label, run, isOk = (r) => r !== false && r != null && r?.ok !== false && !r?.error) {
  const token = startWrite(label);
  try {
    const result = await run();
    finishWrite(token, { ok: isOk(result), error: result?.error });
    return result;
  } catch (err) {
    finishWrite(token, { ok: false, error: err });
    throw err;
  }
}

/**
 * Connect the journal to the database, and report any save the last page
 * left unfinished — the page closed or reloaded while it was in flight.
 */
export function startJournal(send) {
  state.send = send;
  if (typeof window === 'undefined') return;
  try {
    const left = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    localStorage.removeItem(PENDING_KEY);
    for (const p of left?.list || []) {
      report({ kind: 'abandoned', label: p.label, page: p.page, sinceSignInMs: p.sinceSignInMs,
        error: `still in flight when the page closed or reloaded (started ${p.startedAt})`, recent: left.recent });
    }
  } catch { /* nothing readable left behind */ }
}
