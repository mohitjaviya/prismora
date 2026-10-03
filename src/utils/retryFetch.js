/**
 * Retry a request that failed on the way, where retrying cannot do it twice.
 *
 * Reads (GET, HEAD) are retried after a network failure or a 502/503/504:
 * asking again changes nothing. Writes are retried only on 503, which the API
 * gateway sends when it did not pass the request on — so it was not done. A
 * write that failed any other way is not repeated (it may have landed); the
 * screen reports it instead.
 *
 * A write with no answer after WRITE_TIMEOUT_MS is cut off (batch 14), so no
 * save can sit on "Saving…" for ever: supabase-js hands it back as an ordinary
 * { error }, and the screen shows it like any other refusal. It is not
 * repeated either — it may have reached the database.
 */
export const RETRY_DELAYS_MS = [400, 1200];
export const WRITE_TIMEOUT_MS = 20000;
export const SLOW_REQUEST_MS = 4000;
export const TIMEOUT_MARK = 'SAVE_TIMEOUT';

const isRead = (method) => ['GET', 'HEAD'].includes(String(method).toUpperCase());

export function shouldRetry({ method = 'GET', status, networkError, attempt }) {
  if (attempt >= RETRY_DELAYS_MS.length) return false;
  if (isRead(method)) return Boolean(networkError) || [502, 503, 504].includes(status);
  return status === 503;
}

export function timeoutError(ms) {
  const err = new Error(`${TIMEOUT_MARK}: no answer from the server after ${Math.round(ms / 1000)} s`);
  err.name = 'SaveTimeoutError';
  return err;
}

// One attempt, given up after `ms`. A caller's own abort still works.
async function fetchWithin(baseFetch, input, init, ms) {
  const ctrl = new AbortController();
  const outer = init.signal;
  if (outer?.aborted) ctrl.abort(outer.reason);
  else outer?.addEventListener?.('abort', () => ctrl.abort(outer.reason), { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  try {
    return await baseFetch(input, { ...init, signal: ctrl.signal });
  } catch (err) {
    throw timedOut ? timeoutError(ms) : err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * opts.timeoutMs: how long a write may go unanswered.
 * opts.onSlow({ method, url, ms, status }): told about any request slower than
 * SLOW_REQUEST_MS, so a slow save's report shows whether the request itself
 * was the slow part.
 */
export function retryingFetch(baseFetch = (...a) => fetch(...a), sleep = (ms) => new Promise(r => setTimeout(r, ms)), opts = {}) {
  const { timeoutMs = WRITE_TIMEOUT_MS, onSlow, now = () => Date.now() } = opts;
  return async (input, init = {}) => {
    const method = init.method || (typeof input === 'object' && input?.method) || 'GET';
    const url = typeof input === 'string' ? input : String(input?.url || input || '');
    for (let attempt = 0; ; attempt++) {
      const started = now();
      const slow = (status) => {
        const ms = now() - started;
        if (onSlow && ms > SLOW_REQUEST_MS) { try { onSlow({ method, url, ms, status }); } catch { /* never break a request */ } }
      };
      try {
        const res = isRead(method) ? await baseFetch(input, init) : await fetchWithin(baseFetch, input, init, timeoutMs);
        slow(res.status);
        if (!shouldRetry({ method, status: res.status, attempt })) return res;
      } catch (err) {
        slow(err?.name || 'error');
        if (err?.name === 'SaveTimeoutError' || !shouldRetry({ method, networkError: true, attempt })) throw err;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  };
}
