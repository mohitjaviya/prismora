import { describe, it, expect } from 'vitest';
import {
  PUBLIC_VIEWS, partnerLabel, territoryLabel, sortedByName,
  directoryMessage, fetchPublicDirectory,
} from '../publicDirectory';

const okClient = (data) => ({ from: () => ({ select: async () => ({ data, error: null }) }) });
const errClient = (message) => ({ from: () => ({ select: async () => ({ data: null, error: { message } }) }) });
const throwingClient = () => ({ from: () => ({ select: async () => { throw new Error('Failed to fetch'); } }) });

describe('partnerLabel', () => {
  it('shows the territory, which is what tells two same-named firms apart', () => {
    expect(partnerLabel({ name: 'Shree Traders', territoryName: 'Gujarat North' }))
      .toBe('Shree Traders (Gujarat North)');
  });

  it('leaves the brackets off when there is no territory', () => {
    // "Shree Traders ()" reads as a bug, and an unassigned partner produced
    // exactly that before territories were a reference.
    expect(partnerLabel({ name: 'Shree Traders' })).toBe('Shree Traders');
    expect(partnerLabel({ name: 'Shree Traders', territoryName: null })).toBe('Shree Traders');
    expect(partnerLabel({ name: 'Shree Traders', territoryName: '   ' })).toBe('Shree Traders');
  });

  it('gives back nothing for a row with no name', () => {
    expect(partnerLabel({ territoryName: 'Gujarat North' })).toBe('');
    expect(partnerLabel(null)).toBe('');
  });
});

describe('territoryLabel', () => {
  it('names the state, because two zones can share a name', () => {
    expect(territoryLabel({ name: 'North Zone', state: 'Gujarat' })).toBe('North Zone (Gujarat)');
  });

  it('copes with a territory that has no state recorded', () => {
    expect(territoryLabel({ name: 'North Zone' })).toBe('North Zone');
    expect(territoryLabel(undefined)).toBe('');
  });
});

describe('sortedByName', () => {
  it('sorts alphabetically', () => {
    const rows = [{ id: '1', name: 'Zenith' }, { id: '2', name: 'Anand' }, { id: '3', name: 'Mohan' }];
    expect(sortedByName(rows).map(r => r.name)).toEqual(['Anand', 'Mohan', 'Zenith']);
  });

  it('drops rows that cannot be labelled or chosen', () => {
    // A nameless row renders as a blank option that silently submits an id.
    const rows = [{ id: '1', name: 'Anand' }, { id: '2', name: '  ' }, { name: 'No id' }, null];
    expect(sortedByName(rows)).toEqual([{ id: '1', name: 'Anand' }]);
  });

  it('handles nothing at all', () => {
    expect(sortedByName([])).toEqual([]);
    expect(sortedByName()).toEqual([]);
  });
});

describe('directoryMessage', () => {
  it('says so while it is loading', () => {
    expect(directoryMessage({ loading: true, what: 'distributors' })).toMatch(/loading distributors/i);
  });

  it('tells a failed load apart from an empty list', () => {
    // One is worth reloading, the other is worth telephoning about. The page
    // used to show the same empty dropdown for both.
    const failed = directoryMessage({ failed: true, what: 'distributors' });
    const empty = directoryMessage({ count: 0, what: 'distributors' });
    expect(failed).toMatch(/connection/i);
    expect(empty).toMatch(/none|no distributors/i);
    expect(failed).not.toBe(empty);
  });

  it('is an ordinary placeholder when there is something to choose', () => {
    expect(directoryMessage({ count: 3, what: 'distributors' })).toMatch(/select/i);
  });

  it('does not claim to be loading once it has failed', () => {
    expect(directoryMessage({ loading: false, failed: true, count: 0 })).toMatch(/connection/i);
  });
});

describe('fetchPublicDirectory', () => {
  it('reads a public view and sorts what comes back', async () => {
    const r = await fetchPublicDirectory(okClient([{ id: '2', name: 'Zenith' }, { id: '1', name: 'Anand' }]),
      PUBLIC_VIEWS.distributors);
    expect(r.failed).toBe(false);
    expect(r.rows.map(x => x.name)).toEqual(['Anand', 'Zenith']);
  });

  it('refuses a table that is not one of the three public views', async () => {
    // The whole point is that a signup page reaches nothing else. A mistyped
    // name would otherwise 404 in a way that looks like the migration not
    // having been run.
    const r = await fetchPublicDirectory(okClient([]), 'distributors');
    expect(r.failed).toBe(true);
    expect(r.error).toMatch(/not a public view/i);
  });

  it('reports an error from the database as a failure, not an empty list', async () => {
    const r = await fetchPublicDirectory(errClient('permission denied'), PUBLIC_VIEWS.territories);
    expect(r).toMatchObject({ failed: true, rows: [] });
    expect(r.error).toMatch(/permission denied/);
  });

  it('survives fetch itself throwing, which is what offline looks like', async () => {
    // supabase-js returns { error } rather than throwing, so this catch is for
    // the layer below it.
    const r = await fetchPublicDirectory(throwingClient(), PUBLIC_VIEWS.dealers);
    expect(r).toMatchObject({ failed: true, rows: [] });
    expect(r.error).toMatch(/failed to fetch/i);
  });

  it('treats a genuinely empty list as an answer, not a failure', async () => {
    const r = await fetchPublicDirectory(okClient([]), PUBLIC_VIEWS.dealers);
    expect(r).toEqual({ rows: [], failed: false, error: null });
  });

  it('refuses to work without a client rather than throwing', async () => {
    expect((await fetchPublicDirectory(null, PUBLIC_VIEWS.dealers)).failed).toBe(true);
    expect((await fetchPublicDirectory({}, PUBLIC_VIEWS.dealers)).failed).toBe(true);
  });
});
