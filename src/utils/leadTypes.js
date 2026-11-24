import { optionsFor } from './masterLists';

/**
 * Lead Types come from Master Lists ('lead_type'). The stored value on a lead
 * is the type's key (= its name). Only Admin and Super Admin manage the list
 * (migration 101 checks this in the database too).
 */
export const LEAD_TYPE_LIST = 'lead_type';

export const canManageLeadTypes = (roleName) => roleName === 'Super Admin' || roleName === 'Admin';

/** Active types, plus the lead's current value when it is no longer offered
 *  (switched off, or not in the list), so editing an old lead never blanks it. */
export const leadTypeOptions = (masters, current = '') => {
  const active = optionsFor(masters, LEAD_TYPE_LIST);
  const cur = String(current || '').trim();
  if (!cur || active.some(o => o.key === cur)) return active;
  const off = optionsFor(masters, LEAD_TYPE_LIST, { includeInactive: true }).find(o => o.key === cur);
  return [...active, { key: cur, label: `${off ? off.label : cur} (switched off)`, offered: false }];
};

/**
 * Same rule as the database (101): a blank type is fine, an unchanged value is
 * never checked, and a new or changed value must be an active type.
 * Returns an error sentence, or '' when fine.
 */
export const leadTypeProblem = (masters, next, previous, isNew) => {
  const value = String(next || '').trim();
  if (!value) return '';
  if (!isNew && value === String(previous || '').trim()) return '';
  const ok = optionsFor(masters, LEAD_TYPE_LIST).some(o => o.key === value);
  return ok ? '' : `Lead type "${value}" is not an active lead type. Choose one from the list.`;
};

/** How many leads hold a type (for the "cannot delete" message). */
export const leadsUsingType = (leads, key) => (leads || []).filter(l => l.leadType === key).length;
