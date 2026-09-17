/**
 * Roles as data, with the hardcoded matrix kept as the floor beneath them.
 *
 * Who may see what used to be a constant in AuthContext.jsx: fifteen roles
 * against twenty-one modules. Letting Accounts see purchases meant a developer
 * and a deployment. It is a table now — but the old matrix stays here as the
 * fallback, because a permission system that fails open is a security hole and
 * one that fails closed locks everyone out of their own business.
 *
 * Two rules keep it safe to edit:
 *
 *   · An admin-level role always has everything. The screen cannot take a
 *     permission away from Super Admin, because there would be nobody left who
 *     could give it back.
 *
 *   · A role's name is its key. `users.role` stores the name, so renaming one
 *     would orphan every account holding it — the same key-and-label split the
 *     master lists use, for the same reason.
 */

export const MODULES = [
  { id: 'dashboard', name: 'Dashboard', group: 'General' },

  { id: 'leads', name: 'Leads', group: 'Sales & CRM' },
  { id: 'sfa', name: 'SFA / Field Beats', group: 'Sales & CRM' },
  { id: 'customers', name: 'Customers', group: 'Sales & CRM' },
  { id: 'geography', name: 'Geography', group: 'Sales & CRM' },

  { id: 'orders', name: 'Orders', group: 'Operations' },
  { id: 'inventory', name: 'Inventory', group: 'Operations' },
  { id: 'purchases', name: 'Purchases', group: 'Operations' },
  { id: 'stock', name: 'Stock Availability', group: 'Operations' },
  { id: 'priceList', name: 'Price List', group: 'Operations' },

  { id: 'accounting', name: 'Accounting', group: 'Financials' },
  { id: 'schemes', name: 'Schemes', group: 'Financials' },
  { id: 'ledger', name: 'Ledger', group: 'Financials' },
  { id: 'claims', name: 'Claims', group: 'Financials' },
  { id: 'incentives', name: 'Incentives', group: 'Financials' },

  { id: 'complaints', name: 'Complaints', group: 'Customer Support' },
  { id: 'reports', name: 'Reports', group: 'Analytics' },

  { id: 'distributors', name: 'Distributors', group: 'Masters' },
  { id: 'dealers', name: 'Dealers', group: 'Masters' },
  { id: 'retailers', name: 'Retailers', group: 'Masters' },
  { id: 'settings', name: 'Settings & Master Lists', group: 'Masters' },
];

export const MODULE_GROUPS = [...new Set(MODULES.map(m => m.group))];

export const ACCESS_LEVELS = ['none', 'view', 'full'];

export const ROLE_LEVELS = [
  { id: 'admin', name: 'Administrator', hint: 'Everything, always. Cannot be restricted.' },
  { id: 'manager', name: 'Manager', hint: 'Sees their own work and that of the people they manage.' },
  { id: 'sales', name: 'Sales', hint: 'Sees only their own work.' },
  { id: 'staff', name: 'Staff', hint: 'Sees only their own work.' },
  { id: 'partner', name: 'Partner portal', hint: 'A distributor, dealer or retailer signing in to their own account.' },
];

/** An admin-level role is never restricted, whatever the table says. */
export const isAdminLevel = (level) => level === 'admin';

/**
 * What a role may do with a module: 'full', 'view' or 'none'.
 *
 * `fallback` is the compiled-in matrix, used when the table has no row for the
 * role — an unreachable database or an unseeded table must not silently take
 * everybody's access away.
 */
export const accessFor = (roles, fallback, roleName, moduleId) => {
  const row = (roles || []).find(r => r.id === roleName || r.name === roleName);
  if (row) {
    if (row.active === false) return 'none';
    if (isAdminLevel(row.level)) return 'full';
    return row.permissions?.[moduleId] || 'none';
  }
  const fromCode = fallback?.[roleName];
  if (fromCode) return fromCode[moduleId] || 'none';
  return 'none';
};

/** The level a role sits at, for the manager and admin checks across the app. */
export const levelFor = (roles, fallbackLevels, roleName) => {
  const row = (roles || []).find(r => r.id === roleName || r.name === roleName);
  if (row?.level) return row.level;
  return fallbackLevels?.[roleName] || 'staff';
};

/** How many modules a role can reach at all — the count shown on its card. */
export const grantedCount = (role) => {
  if (!role) return 0;
  if (isAdminLevel(role.level)) return MODULES.length;
  return Object.values(role.permissions || {}).filter(v => v && v !== 'none').length;
};

/**
 * Why this change cannot be saved, or null when it can.
 *
 * Checked here rather than only in the screen, because the cost of getting it
 * wrong is an administrator who can no longer administer anything — and there
 * is no way back from that inside the app.
 */
export const rejectPermissionChange = ({ role, moduleId, access, editingOwnRole }) => {
  if (!role) return 'That role no longer exists.';
  if (isAdminLevel(role.level)) {
    return 'An administrator role always has everything. Change its level first if that is not what you want.';
  }
  if (editingOwnRole && moduleId === 'settings' && access !== 'full') {
    return 'This is your own role. Taking away Settings would lock you out of this screen, and nobody could give it back.';
  }
  return null;
};
