import { describe, it, expect, vi } from 'vitest';
import { createLoadGate, gateWrites, isWriteAction } from '../loadGate';
import { shouldRetry, retryingFetch } from '../retryFetch';

describe('load gate', () => {
  it('holds a save until the first load has landed', async () => {
    const gate = createLoadGate();
    const order = [];
    const actions = gateWrites({ updateOrder: async () => order.push('saved') }, gate);
    const saving = actions.updateOrder();
    await new Promise(r => setTimeout(r, 20));
    order.push('load landed');
    gate.open();
    await saving;
    // The O6/O9 failure was the other way round: saved, then overwritten by the load.
    expect(order).toEqual(['load landed', 'saved']);
  });

  it('lets saves straight through once open', async () => {
    const gate = createLoadGate(); gate.open();
    expect(await gate.wait()).toBe(0);
  });

  it('does not wait for ever if the load hangs', async () => {
    const gate = createLoadGate();
    expect(await gate.wait(30)).toBeGreaterThanOrEqual(25);
  });

  it('gates writes only, by name', () => {
    expect(['addInvoice', 'updateOrder', 'convertInvoice', 'deliverPartial', 'cancelMyOrder', 'recordOrderReceipt'].every(isWriteAction)).toBe(true);
    expect(['orders', 'dismissSchemaError', 'address', 'updated'].some(isWriteAction)).toBe(false);
  });
});

describe('retries', () => {
  it('retries reads after a network failure or gateway error', () => {
    expect(shouldRetry({ method: 'GET', networkError: true, attempt: 0 })).toBe(true);
    expect(shouldRetry({ method: 'GET', status: 504, attempt: 1 })).toBe(true);
    expect(shouldRetry({ method: 'GET', status: 504, attempt: 2 })).toBe(false);
    expect(shouldRetry({ method: 'GET', status: 400, attempt: 0 })).toBe(false);
  });

  it('never repeats a write that may have landed', () => {
    expect(shouldRetry({ method: 'POST', networkError: true, attempt: 0 })).toBe(false);
    expect(shouldRetry({ method: 'PATCH', status: 504, attempt: 0 })).toBe(false);
    expect(shouldRetry({ method: 'POST', status: 503, attempt: 0 })).toBe(true);
  });

  it('returns the second answer after one failed read', async () => {
    const base = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 200 });
    const res = await retryingFetch(base, async () => {})('https://x/rest/v1/orders', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('reports a failed write at once', async () => {
    const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(retryingFetch(base, async () => {})('https://x/rest/v1/orders', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(base).toHaveBeenCalledTimes(1);
  });
});
