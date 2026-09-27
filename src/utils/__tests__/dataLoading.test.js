import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Every table the data layer keeps in state must also be refreshed from the
// database on load. sfa_expenses was kept (from the browser cache) and never
// fetched, so a rep's expense claim was invisible to their manager on any
// other device. This reads DataContext itself, so a table added later without
// a fetch fails here rather than in someone's approval queue.
const src = readFileSync(fileURLToPath(new URL('../../context/DataContext.jsx', import.meta.url)), 'utf8');
const found = (re) => [...new Set([...src.matchAll(re)].map(m => m[1]))].sort();

describe('the data layer loads every table it keeps', () => {
  const cached = found(/lsInit\('prismora_([a-z_]+)'\)/g);
  const refreshed = found(/applyFetched\('prismora_([a-z_]+)'/g);

  it('refreshes each cached table from the database', () => {
    expect(cached.length).toBeGreaterThan(20);
    expect(cached.filter(t => !refreshed.includes(t))).toEqual([]);
  });

  it('loads SFA expense claims', () => {
    expect(refreshed).toContain('sfa_expenses');
    expect(src).toMatch(/sfa_expenses: begin\(supabase\.from\('sfa_expenses'\)/);
  });
});
