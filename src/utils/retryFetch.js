/**
 * Retry a request that failed on the way, where retrying cannot do it twice.
 *
 * Reads (GET, HEAD) are retried after a network failure or a 502/503/504:
 * asking again changes nothing. Writes are retried only on 503, which the API
 * gateway sends when it did not pass the request on — so it was not done. A
 * write that failed any other way is not repeated (it may have landed); the
 * screen reports it instead.
 */
export const RETRY_DELAYS_MS = [400, 1200];

export function shouldRetry({ method = 'GET', status, networkError, attempt }) {
  if (attempt >= RETRY_DELAYS_MS.length) return false;
  const read = ['GET', 'HEAD'].includes(String(method).toUpperCase());
  if (read) return Boolean(networkError) || [502, 503, 504].includes(status);
  return status === 503;
}

export function retryingFetch(baseFetch = (...a) => fetch(...a), sleep = (ms) => new Promise(r => setTimeout(r, ms))) {
  return async (input, init = {}) => {
    const method = init.method || (typeof input === 'object' && input?.method) || 'GET';
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await baseFetch(input, init);
        if (!shouldRetry({ method, status: res.status, attempt })) return res;
      } catch (err) {
        if (!shouldRetry({ method, networkError: true, attempt })) throw err;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  };
}
