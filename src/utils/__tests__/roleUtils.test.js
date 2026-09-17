import { describe, it, expect } from 'vitest';
import {
  MODULES, accessFor, levelFor, grantedCount, isAdminLevel, rejectPermissionChange,
  fallbackRoles, roleSummary, peopleByRole, holdersOf, orphanedRoles,
} from '../roleUtils';

const FALLBACK = {
  'Sales Manager': { orders: 'view', leads: 'full', settings: 'none' },
  'Super Admin': { orders: 'full', leads: 'full', settings: 'full' },
};
const FALLBACK_LEVELS = { 'Sales Manager': 'manager', 'Super Admin': 'admin' };

const role = (over = {}) => ({
  id: 'Sales Manager', name: 'Sales Manager', level: 'manager',
  permissions: { orders: 'view', leads: 'full' }, active: true, isSystem: true, ...over,
});

describe('accessFor — what a role may do', () => {
  it('reads the stored permission', () => {
    expect(accessFor([role()], FALLBACK, 'Sales Manager', 'orders')).toBe('view');
    expect(accessFor([role()], FALLBACK, 'Sales Manager', 'leads')).toBe('full');
  });

  it('treats a module the role has no entry for as none', () => {
    expect(accessFor([role()], FALLBACK, 'Sales Manager', 'accounting')).toBe('none');
  });

  // The table failing must never quietly strip everyone's access.
  it('falls back to the compiled matrix when the table has no such role', () => {
    expect(accessFor([], FALLBACK, 'Sales Manager', 'leads')).toBe('full');
    expect(accessFor(null, FALLBACK, 'Sales Manager', 'orders')).toBe('view');
  });

  it('gives nothing for a role neither the table nor the code knows', () => {
    expect(accessFor([], FALLBACK, 'Invented Role', 'orders')).toBe('none');
  });

  it('gives an admin-level role everything, whatever its stored permissions say', () => {
    const stripped = role({ id: 'Super Admin', level: 'admin', permissions: { orders: 'none' } });
    expect(accessFor([stripped], FALLBACK, 'Super Admin', 'orders')).toBe('full');
    expect(accessFor([stripped], FALLBACK, 'Super Admin', 'anything-at-all')).toBe('full');
  });

  it('gives a switched-off role nothing', () => {
    expect(accessFor([role({ active: false })], FALLBACK, 'Sales Manager', 'leads')).toBe('none');
  });
});

describe('levelFor — which checks a role passes', () => {
  it('reads the stored level', () => {
    expect(levelFor([role()], FALLBACK_LEVELS, 'Sales Manager')).toBe('manager');
  });

  it('falls back to the compiled level when the role is not in the table', () => {
    expect(levelFor([], FALLBACK_LEVELS, 'Super Admin')).toBe('admin');
  });

  it('treats an unknown role as staff rather than guessing upwards', () => {
    expect(levelFor([], FALLBACK_LEVELS, 'Invented Role')).toBe('staff');
  });
});

describe('grantedCount', () => {
  it('counts only the modules actually granted', () => {
    expect(grantedCount(role({ permissions: { orders: 'view', leads: 'full', sfa: 'none' } }))).toBe(2);
  });

  it('counts everything for an admin role', () => {
    expect(grantedCount(role({ level: 'admin', permissions: {} }))).toBe(MODULES.length);
  });

  it('copes with a role that has no permissions object', () => {
    expect(grantedCount({ level: 'staff' })).toBe(0);
    expect(grantedCount(null)).toBe(0);
  });
});

describe('rejectPermissionChange — the two ways to lock yourself out', () => {
  it('refuses to restrict an administrator role', () => {
    const msg = rejectPermissionChange({ role: role({ level: 'admin' }), moduleId: 'orders', access: 'none' });
    expect(msg).toMatch(/administrator role always has everything/i);
  });

  it('refuses to take Settings from your own role', () => {
    const msg = rejectPermissionChange({ role: role(), moduleId: 'settings', access: 'view', editingOwnRole: true });
    expect(msg).toMatch(/lock you out/i);
  });

  it('allows taking Settings from a role that is not yours', () => {
    expect(rejectPermissionChange({ role: role(), moduleId: 'settings', access: 'none', editingOwnRole: false })).toBeNull();
  });

  it('allows an ordinary change to your own role', () => {
    expect(rejectPermissionChange({ role: role(), moduleId: 'orders', access: 'full', editingOwnRole: true })).toBeNull();
  });

  it('refuses when the role has gone', () => {
    expect(rejectPermissionChange({ role: null, moduleId: 'orders', access: 'full' })).toMatch(/no longer exists/i);
  });
});

describe('the module list', () => {
  it('has a unique id for every module', () => {
    const ids = MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the twenty-one the permission matrix uses', () => {
    expect(MODULES.length).toBe(21);
  });

  it('puts every module in a group', () => {
    expect(MODULES.every(m => m.group)).toBe(true);
  });

  it('knows admin is the only unrestricted level', () => {
    expect(isAdminLevel('admin')).toBe(true);
    expect(isAdminLevel('manager')).toBe(false);
  });
});

describe('fallbackRoles - showing the compiled matrix when there is no table', () => {
  it('turns the matrix into rows the screen can render', () => {
    const rows = fallbackRoles(FALLBACK, FALLBACK_LEVELS);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual(['Sales Manager', 'Super Admin']);
    expect(rows[0].permissions).toEqual(FALLBACK['Sales Manager']);
  });

  it('marks every row as a fallback, so the screen knows not to offer saving', () => {
    expect(fallbackRoles(FALLBACK, FALLBACK_LEVELS).every(r => r.isFallback)).toBe(true);
  });

  it('carries the level across, since that decides admin and manager checks', () => {
    const rows = fallbackRoles(FALLBACK, FALLBACK_LEVELS);
    expect(rows.find(r => r.id === 'Super Admin').level).toBe('admin');
    expect(rows.find(r => r.id === 'Sales Manager').level).toBe('manager');
  });

  it('defaults an unlevelled role to staff rather than guessing upwards', () => {
    expect(fallbackRoles({ Mystery: {} }, {})[0].level).toBe('staff');
  });

  // The screen reads these rows the same way it reads real ones.
  it('produces rows accessFor and grantedCount understand', () => {
    const rows = fallbackRoles(FALLBACK, FALLBACK_LEVELS);
    expect(accessFor(rows, {}, 'Sales Manager', 'leads')).toBe('full');
    expect(accessFor(rows, {}, 'Super Admin', 'anything')).toBe('full');
    expect(grantedCount(rows.find(r => r.id === 'Sales Manager'))).toBe(2);
  });

  it('copes with no matrix at all', () => {
    expect(fallbackRoles(null, null)).toEqual([]);
  });
});

describe('roleSummary - what a role adds up to', () => {
  it('counts full, view and none across every module', () => {
    const s = roleSummary(role({ permissions: { orders: 'full', leads: 'view' } }));
    expect(s.full).toBe(1);
    expect(s.view).toBe(1);
    expect(s.none).toBe(MODULES.length - 2);
  });

  it('gives an admin role everything', () => {
    expect(roleSummary({ level: 'admin' })).toEqual({ full: MODULES.length, view: 0, none: 0 });
  });

  it('always totals the module count, so the bar never over- or under-fills', () => {
    const s = roleSummary(role({ permissions: { orders: 'nonsense', leads: 'view' } }));
    expect(s.full + s.view + s.none).toBe(MODULES.length);
  });

  it('copes with no role at all', () => {
    expect(roleSummary(null).none).toBe(MODULES.length);
  });
});

describe('peopleByRole / holdersOf - who holds a role', () => {
  const users = [
    { id: 1, name: 'Asha', role: 'Super Admin' },
    { id: 2, name: 'Bhavin', role: 'Sales Manager' },
    { id: 3, name: 'Chirag', role: 'Sales Manager' },
  ];

  it('groups people under the role they hold', () => {
    expect(holdersOf(peopleByRole(users), 'Sales Manager').map(u => u.name)).toEqual(['Bhavin', 'Chirag']);
  });

  // users.role is free text. A record saved as 'super admin' is still a Super
  // Admin, and counting it as nobody would misstate who can do what.
  it('matches regardless of case or surrounding space', () => {
    const odd = [{ id: 9, name: 'Dev', role: '  SUPER ADMIN ' }];
    expect(holdersOf(peopleByRole(odd), 'Super Admin').map(u => u.name)).toEqual(['Dev']);
  });

  it('returns nobody for a role no one holds, rather than undefined', () => {
    expect(holdersOf(peopleByRole(users), 'Dispatch Team')).toEqual([]);
    expect(holdersOf(peopleByRole(null), 'Anything')).toEqual([]);
  });

  it('ignores accounts with no role set', () => {
    expect(Object.keys(peopleByRole([{ id: 1 }, { id: 2, role: '' }, { id: 3, role: null }]))).toEqual([]);
  });
});

describe('orphanedRoles - accounts locked out by a role that does not exist', () => {
  const roles = [{ id: 'Super Admin' }, { id: 'Sales Manager' }];

  it('finds role names held by people but defined nowhere', () => {
    const users = [{ id: 1, role: 'Super Admin' }, { id: 2, role: 'Regional Head' }];
    expect(Object.keys(orphanedRoles(users, roles))).toEqual(['Regional Head']);
  });

  it('keeps everyone affected, so the warning can say how many', () => {
    const users = [{ id: 1, role: 'Ghost' }, { id: 2, role: 'Ghost' }];
    expect(orphanedRoles(users, roles).Ghost).toHaveLength(2);
  });

  it('does not report a role that differs only by case', () => {
    expect(orphanedRoles([{ id: 1, role: 'sales manager' }], roles)).toEqual({});
  });

  it('reports nothing when every role is known', () => {
    expect(orphanedRoles([{ id: 1, role: 'Super Admin' }], roles)).toEqual({});
  });
});
