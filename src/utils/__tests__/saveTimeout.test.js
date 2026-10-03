import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryingFetch, WRITE_TIMEOUT_MS, SLOW_REQUEST_MS } from '../retryFetch';
import { plainDatabaseError, SAVE_TIMEOUT_TEXT } from '../writeErrors';

// A fetch that never answers until its signal is aborted, as a hung request.
const hanging = vi.fn((_url, init) => new Promise((_, reject) => {
  init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
}));

describe('save timeout (batch 14)', () => {
  afterEach(() => { vi.useRealTimers(); hanging.mockClear(); });

  it('gives up a write with no answer after 20 s, once, with the timeout mark', async () => {
    vi.useFakeTimers();
    const p = retryingFetch(hanging, async () => {})('https://x/rest/v1/schemes', { method: 'PATCH' });
    const caught = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS - 1);
    expect(hanging).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const err = await caught;
    expect(WRITE_TIMEOUT_MS).toBe(20000);
    expect(err.name).toBe('SaveTimeoutError');
    expect(err.message).toMatch(/SAVE_TIMEOUT/);
    expect(hanging).toHaveBeenCalledTimes(1); // never repeated
  });

  it('leaves reads to run as before (no timeout)', async () => {
    vi.useFakeTimers();
    let settled = false;
    const base = vi.fn(() => new Promise(() => {}));
    retryingFetch(base, async () => {})('https://x/rest/v1/orders', { method: 'GET' }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS * 3);
    expect(settled).toBe(false);
    expect(base.mock.calls[0][1].signal).toBeUndefined();
  });

  it('a write that answers in time is returned untouched', async () => {
    const res = { status: 201 };
    const base = vi.fn(async () => res);
    expect(await retryingFetch(base, async () => {})('https://x/rest/v1/leads', { method: 'POST' })).toBe(res);
  });

  it('a caller abort still aborts, and is not reported as a timeout', async () => {
    const ctrl = new AbortController();
    const p = retryingFetch(hanging, async () => {})('https://x/rest/v1/leads', { method: 'POST', signal: ctrl.signal });
    ctrl.abort();
    const err = await p.catch(e => e);
    expect(err.name).toBe('AbortError');
  });

  it('tells onSlow about a request slower than 4 s, and not about a quick one', async () => {
    let t = 0;
    const onSlow = vi.fn();
    const base = vi.fn(async () => { t += SLOW_REQUEST_MS + 1; return { status: 200 }; });
    const f = retryingFetch(base, async () => {}, { onSlow, now: () => t });
    await f('https://x/rest/v1/orders?id=eq.O1', { method: 'PATCH' });
    expect(onSlow).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH', status: 200, ms: SLOW_REQUEST_MS + 1 }));
    onSlow.mockClear();
    const quick = retryingFetch(async () => ({ status: 200 }), async () => {}, { onSlow, now: () => 0 });
    await quick('https://x/rest/v1/orders', { method: 'GET' });
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('the timeout reads as a clear sentence on the screen', () => {
    // As supabase-js hands it back: "<name>: <message>".
    const error = { message: 'SaveTimeoutError: SAVE_TIMEOUT: no answer from the server after 20 s', code: '' };
    expect(plainDatabaseError(error, 'save the scheme')).toBe(SAVE_TIMEOUT_TEXT);
    expect(SAVE_TIMEOUT_TEXT).toMatch(/No answer from the server after 20 seconds\. It may or may not have saved/);
  });
});
