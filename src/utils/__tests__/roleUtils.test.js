import { describe, it, expect } from 'vitest';
import {
  MODULES, accessFor, levelFor, grantedCount, isAdminLevel, rejectPermissionChange,
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
