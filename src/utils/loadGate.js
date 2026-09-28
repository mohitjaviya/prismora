/**
 * Saves wait for the first data load.
 *
 * The app loads every table once at sign-in, in parallel. A save made while
 * that load was still in flight reached the database, and then the load
 * landed with its older snapshot and replaced the table on screen: the change
 * vanished, and looked as though it had never been saved (O6's advance
 * invoice, O9's first delivery). The screen's own checks ran against tables
 * not loaded yet, too — a delivery checked against no inventory at all.
 *
 * A gate that opens once the load has landed. A save waits at it, then runs
 * on complete data. If the load hangs, the save goes ahead after `timeoutMs`
 * rather than never.
 */
export function createLoadGate() {
  let open = false;
  let release;
  const opened = new Promise(r => { release = r; });
  return {
    get isOpen() { return open; },
    open() { if (!open) { open = true; release(); } },
    /** Resolves with how long it waited, in ms (0 when already open). */
    async wait(timeoutMs = 20000) {
      if (open) return 0;
      const start = Date.now();
      await Promise.race([opened, new Promise(r => setTimeout(r, timeoutMs))]);
      return Date.now() - start;
    },
  };
}

// The data layer's save actions, by name. Everything the screens call that
// writes starts with one of these; reads and helpers do not.
const WRITE_ACTION = /^(add|update|delete|convert|record|confirm|cancel|deliver|split|adjust|transfer|receive|reconcile|correct|clear|mark|approve|reject|book|settle|withdraw|issue)[A-Z]/;

export const isWriteAction = (name) => WRITE_ACTION.test(name);

/** Wrap every write action in `actions` so it waits at `gate` first. */
export function gateWrites(actions, gate, onWaited) {
  const out = {};
  for (const [name, fn] of Object.entries(actions)) {
    out[name] = typeof fn === 'function' && isWriteAction(name)
      ? async (...args) => {
        const waited = await gate.wait();
        if (waited > 0 && onWaited) onWaited(name, waited);
        return fn(...args);
      }
      : fn;
  }
  return out;
}
