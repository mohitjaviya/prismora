/**
 * Whose field records a user may see: visit reports, attendance, beats and
 * expense claims.
 *
 *   · admin level (Admin, Super Admin, Director) — everyone's
 *   · manager level (Sales Manager, Manager)     — their own and their team's,
 *                                                  the users in managedUsers
 *   · everyone else, a Sales Executive included  — their own only
 *
 * The same rule is enforced by the database (035_sfa_own_rows.sql), so this is
 * what the screen shows, not the only thing standing between one rep and
 * another's records.
 */
export const canSeeOwner = (viewer, viewerLevel, ownerId) => {
  if (!viewer) return false;
  if (viewerLevel === 'admin') return true;
  if (viewer.id === ownerId) return true;
  if (viewerLevel === 'manager') return (viewer.managedUsers || []).includes(ownerId);
  return false;
};

/** The rows of `records` whose `ownerKey` the viewer may see. */
export const visibleTo = (records, ownerKey, viewer, viewerLevel) =>
  (records || []).filter(r => canSeeOwner(viewer, viewerLevel, r?.[ownerKey]));

/**
 * Whether a role's lists are limited to the accounts it owns.
 *
 * "Reps see their own, managers their team's" is a sales rule. It was applied
 * to everyone, so a role that owns no accounts — Accounts, Dispatch,
 * Warehouse, Customer Support, Purchase Manager — saw almost nothing: the
 * Accounting screen showed Accounts 0 invoices and 0 expenses while the
 * database handed it every one. Only roles that work accounts (full Leads or
 * full SFA access) are limited this way; everyone else sees whatever the
 * database lets them read, which is where access is enforced anyway.
 */
export const scopedToOwnAccounts = ({ level, canEditLeads, canEditSfa }) =>
  level !== 'admin' && Boolean(canEditLeads || canEditSfa);
