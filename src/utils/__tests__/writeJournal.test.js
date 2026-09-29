import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportKind, reportRow, journaled, startJournal, startWrite, SLOW_MS, subscribe, clearAbandoned } from '../writeJournal';

describe('reportKind', () => {
  it('reports a failed save whatever its speed', () => {
    expect(reportKind({ ok: false, durationMs: 10 })).toBe('failed');
  });
  it('reports a save that worked but took longer than SLOW_MS', () => {
    expect(reportKind({ ok: true, durationMs: SLOW_MS + 1 })).toBe('slow');
  });
  it('stays quiet about a quick save that worked', () => {
    expect(reportKind({ ok: true, durationMs: 200 })).toBeNull();
  });
});

describe('reportRow', () => {
  it('trims long text and keeps only the last few events', () => {
    const row = reportRow({ kind: 'failed', label: 'x'.repeat(500), error: 'e'.repeat(5000), durationMs: 12.7,
      recent: Array.from({ length: 30 }, (_, i) => ({ i })) });
    expect(row.label).toHaveLength(200);
    expect(row.error).toHaveLength(1000);
    expect(row.duration_ms).toBe(13);
    expect(row.recent).toHaveLength(12);
    expect(row.recent.at(-1)).toEqual({ i: 29 });
  });
});

describe('journaled', () => {
  let sent;
  beforeEach(() => {
    sent = [];
    startJournal(row => { sent.push(row); return Promise.resolve(); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('passes the result through and reports nothing for a save that worked', async () => {
    expect(await journaled('save a', async () => ({ ok: true }))).toEqual({ ok: true });
    expect(sent).toEqual([]);
  });

  // The silent failures: a save that came back refused, with no message on screen.
  it.each([
    ['false', false],
    ['null (a refused insert)', null],
    ['{ ok: false }', { ok: false, error: 'refused by RLS' }],
  ])('reports a save that returned %s', async (_, result) => {
    await journaled('deliver O9', async () => result);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'failed', label: 'deliver O9' });
  });

  it('reports and rethrows a save that threw', async () => {
    await expect(journaled('convert invoice INV-1', async () => { throw new Error('network down'); })).rejects.toThrow('network down');
    expect(sent[0]).toMatchObject({ kind: 'failed', error: 'network down' });
  });
});

describe('a save cut off by a reload', () => {
  it('is reported as abandoned when the next page starts', () => {
    const store = {};
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    startWrite('add invoice O6');          // the page reloads before it finishes
    const sent = [];
    startJournal(row => { sent.push(row); return Promise.resolve(); });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'abandoned', label: 'add invoice O6' });
    // …and the person is told too, even by a listener that arrives later (B07)
    const heard = [];
    const stop = subscribe(e => heard.push(e));
    expect(heard[0]).toMatchObject({ type: 'abandoned', list: [{ label: 'add invoice O6' }] });
    stop(); clearAbandoned();
    vi.unstubAllGlobals();
  });
});
