import { describe, it, expect } from 'vitest';
import { canSeeOwner, visibleTo } from '../sfaVisibility';

const ABHI = { id: 'U-abhi', role: 'Sales Executive', managedUsers: [] };
const ANKITA = { id: 'U-ankita', role: 'Sales Executive', managedUsers: [] };
const MANAGER = { id: 'U-mgr', role: 'Sales Manager', managedUsers: ['U-abhi', 'U-ankita'] };
const OTHER_MANAGER = { id: 'U-mgr2', role: 'Sales Manager', managedUsers: ['U-someone-else'] };
const ADMIN = { id: '1', role: 'Admin', managedUsers: [] };

const REPORTS = [
  { id: 'VR-1', executiveId: 'U-abhi', outletName: 'Shiv medicals' },
  { id: 'VR-2', executiveId: 'U-abhi', outletName: 'Radhe wellness' },
  { id: 'VR-3', executiveId: 'U-ankita', outletName: 'a-22 kamrej surat' },
  { id: 'VR-4', executiveId: null, outletName: 'rep since removed' },
];
const ids = (rows) => rows.map(r => r.id);

describe('visit reports - who sees whose', () => {
  // The bug: abhi, a Sales Executive, saw Ankita's visit reports.
  it('shows a Sales Executive only their own visit reports', () => {
    expect(ids(visibleTo(REPORTS, 'executiveId', ABHI, 'sales'))).toEqual(['VR-1', 'VR-2']);
    expect(ids(visibleTo(REPORTS, 'executiveId', ANKITA, 'sales'))).toEqual(['VR-3']);
  });

  it('shows a manager their own team, and not another team', () => {
    expect(ids(visibleTo(REPORTS, 'executiveId', MANAGER, 'manager'))).toEqual(['VR-1', 'VR-2', 'VR-3']);
    expect(visibleTo(REPORTS, 'executiveId', OTHER_MANAGER, 'manager')).toEqual([]);
  });

  it('shows an admin everything, including rows whose rep was removed', () => {
    expect(ids(visibleTo(REPORTS, 'executiveId', ADMIN, 'admin'))).toEqual(['VR-1', 'VR-2', 'VR-3', 'VR-4']);
  });

  it('shows nobody but an admin a row with no owner', () => {
    expect(canSeeOwner(ABHI, 'sales', null)).toBe(false);
    expect(canSeeOwner(MANAGER, 'manager', null)).toBe(false);
  });

  it('shows nothing when nobody is signed in', () => {
    expect(visibleTo(REPORTS, 'executiveId', null, null)).toEqual([]);
  });
});

describe('the same rule on the other field records', () => {
  const attendance = [{ id: 'A1', userId: 'U-abhi' }, { id: 'A2', userId: 'U-ankita' }];
  const expenses = [{ id: 'E1', userId: 'U-ankita' }, { id: 'E2', userId: 'U-abhi' }];
  const beats = [{ id: 'B1', executiveId: 'U-ankita' }, { id: 'B2', executiveId: 'U-abhi' }];

  it('keeps attendance, expenses and beats to the rep who owns them', () => {
    expect(ids(visibleTo(attendance, 'userId', ABHI, 'sales'))).toEqual(['A1']);
    expect(ids(visibleTo(expenses, 'userId', ABHI, 'sales'))).toEqual(['E2']);
    expect(ids(visibleTo(beats, 'executiveId', ABHI, 'sales'))).toEqual(['B2']);
  });

  it('gives a manager their whole team on each', () => {
    expect(visibleTo(attendance, 'userId', MANAGER, 'manager')).toHaveLength(2);
    expect(visibleTo(expenses, 'userId', MANAGER, 'manager')).toHaveLength(2);
    expect(visibleTo(beats, 'executiveId', MANAGER, 'manager')).toHaveLength(2);
  });
});
