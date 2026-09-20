import { describe, it, expect, vi } from 'vitest';
import { guardedWrite, reverseInOrder, alreadyApplied } from '../guardedWrite';

describe('guardedWrite — the refused write', () => {
  it('does not run the effects when the write is refused', async () => {
    // The bug that accounted for ten of sixteen problems in the write sweep:
    // a refused payment still reduced the balance and marked invoices Paid.
    const balanceChange = vi.fn();
    const result = await guardedWrite({
      write: async () => false,
      rollback: vi.fn(),
      effects: [balanceChange],
    });

    expect(balanceChange).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('rolls back the optimistic change when the write is refused', async () => {
    const rollback = vi.fn();
    await guardedWrite({ write: async () => false, rollback, effects: [] });
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown write as a refusal, not as a crash', async () => {
    const rollback = vi.fn();
    const effect = vi.fn();
    const result = await guardedWrite({
      write: async () => { throw new Error('network gone'); },
      rollback,
      effects: [effect],
    });

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(effect).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.cause).toBeInstanceOf(Error);
  });

  it('treats every falsy answer as a refusal', async () => {
    for (const answer of [false, null, undefined, 0, '']) {
      const effect = vi.fn();
      await guardedWrite({ write: async () => answer, effects: [effect] });
      expect(effect).not.toHaveBeenCalled();
    }
  });

  it('names what could not be saved, so the screen can say it', async () => {
    const result = await guardedWrite({ write: async () => false, label: 'the payment' });
    expect(result.error).toMatch(/the payment/);
  });

  it('survives having no rollback to run', async () => {
    const result = await guardedWrite({ write: async () => false });
    expect(result.ok).toBe(false);
  });
});

describe('guardedWrite — the write that succeeds', () => {
  it('runs the effects in the order given', async () => {
    const order = [];
    await guardedWrite({
      write: async () => true,
      effects: [
        async () => { order.push('balance'); },
        async () => { order.push('stock'); },
        async () => { order.push('status'); },
      ],
    });
    expect(order).toEqual(['balance', 'stock', 'status']);
  });

  it('does not roll back a write that went through', async () => {
    const rollback = vi.fn();
    await guardedWrite({ write: async () => true, rollback, effects: [] });
    expect(rollback).not.toHaveBeenCalled();
  });

  it('keeps going when one effect fails, and says how many did not take', async () => {
    // The record is real and stays. A failed effect is reported rather than
    // unwinding a row that was written -- recoverable, unlike a silent half.
    const later = vi.fn();
    const result = await guardedWrite({
      write: async () => true,
      effects: [
        async () => { throw new Error('balance write refused'); },
        later,
      ],
    });

    expect(later).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.failedEffects).toBe(1);
  });

  it('is not partial when everything worked', async () => {
    const result = await guardedWrite({
      write: async () => true,
      effects: [async () => 1, async () => 2],
    });
    expect(result.ok).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.results.map(r => r.value)).toEqual([1, 2]);
  });

  it('refuses to run at all without something to write', async () => {
    const effect = vi.fn();
    const result = await guardedWrite({ effects: [effect] });
    expect(result.ok).toBe(false);
    expect(effect).not.toHaveBeenCalled();
  });
});

describe('reverseInOrder', () => {
  it('undoes in the opposite order to doing', async () => {
    // A purchase-return withdrawal restores the vendor balance before deleting
    // the row, not after.
    const done = [];
    await reverseInOrder([
      async () => { done.push('wrote row'); },
      async () => { done.push('moved money'); },
      async () => { done.push('moved stock'); },
    ]);
    expect(done).toEqual(['moved stock', 'moved money', 'wrote row']);
  });

  it('attempts every step even when one fails', async () => {
    const last = vi.fn();
    const result = await reverseInOrder([
      last,
      async () => { throw new Error('could not restore'); },
    ]);
    expect(last).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('reports success only when every step took', async () => {
    expect((await reverseInOrder([async () => 1, async () => 2])).ok).toBe(true);
    expect((await reverseInOrder([])).ok).toBe(true);
  });
});

describe('alreadyApplied', () => {
  const RECORDS = [{ id: 'PAY-INV-INV-1' }, { id: 'EXP-INC-INC-7' }];

  it('stops a retry applying the same thing twice', () => {
    expect(alreadyApplied('PAY-INV-INV-1', RECORDS)).toBe(true);
    expect(alreadyApplied('EXP-INC-INC-7', RECORDS)).toBe(true);
  });

  it('does not confuse it with a different record', () => {
    expect(alreadyApplied('PAY-INV-INV-2', RECORDS)).toBe(false);
  });

  it('is false for nothing to check', () => {
    expect(alreadyApplied('', RECORDS)).toBe(false);
    expect(alreadyApplied(null, RECORDS)).toBe(false);
    expect(alreadyApplied('PAY-INV-INV-1', [])).toBe(false);
    expect(alreadyApplied('PAY-INV-INV-1')).toBe(false);
  });
});
