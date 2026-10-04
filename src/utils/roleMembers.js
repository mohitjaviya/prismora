/**
 * The people holding one role, as rows for the Roles screen's Members table
 * (Gap 10).
 *
 * `users` has no phone or last-login column: a partner login's phone is its
 * firm's (distributor / dealer / retailer record), a staff login has none. The
 * linked party is that firm for a partner login, and the manager(s) whose team
 * includes the person for staff.
 */

const PARTY_LINKS = [
  { field: 'distributorId', kind: 'Distributor', list: 'distributors', path: '/distributors' },
  { field: 'dealerId', kind: 'Dealer', list: 'dealers', path: '/dealers' },
  { field: 'retailerId', kind: 'Retailer', list: 'retailers', path: '/retailers' },
];

/** The partner record a login is attached to, or null. */
export const linkedPartyOf = (u, parties = {}) => {
  for (const l of PARTY_LINKS) {
    const id = u?.[l.field];
    if (!id) continue;
    const rec = (parties[l.list] || []).find(p => p?.id === id) || null;
    return { kind: l.kind, id, name: rec?.name || null, phone: rec?.phone || null, path: l.path, found: Boolean(rec) };
  }
  return null;
};

/** Names of the people whose team includes `u`. */
export const managersOf = (u, users) =>
  (users || [])
    .filter(m => m && m.id !== u?.id && (m.managedUsers || []).includes(u?.id))
    .map(m => m.name || m.email)
    .filter(Boolean);

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const normEmail = (s) => String(s || '').trim().toLowerCase();
// Digits only, last ten, so "+91 98765 43210" and "9876543210" match. Anything
// shorter than six digits is too little to call a match.
const normPhone = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  return d.length < 6 ? '' : d.slice(-10);
};

/**
 * Which rows share a name (ignoring case and spacing), phone or e-mail with
 * another row in the same list. Returns { [id]: ['name' | 'phone' | 'email', …] }
 * for the flagged rows only. Display only: nothing is merged or removed.
 */
export const duplicateFlags = (rows) => {
  const keys = { name: r => normName(r.name), phone: r => normPhone(r.phone), email: r => normEmail(r.email) };
  const out = {};
  Object.entries(keys).forEach(([what, keyOf]) => {
    const groups = {};
    (rows || []).forEach(r => {
      const k = keyOf(r);
      if (k) (groups[k] = groups[k] || []).push(r.id);
    });
    Object.values(groups).forEach(ids => {
      if (ids.length < 2) return;
      ids.forEach(id => { (out[id] = out[id] || []).push(what); });
    });
  });
  return out;
};

/** Active unless the account says otherwise (old rows have no status). */
export const memberStatus = (u) => u?.status || 'Active';

/** One row per holder: who, how to reach them, what they are linked to, and possible duplicates. */
export const roleMemberRows = (holders, { users, distributors, dealers, retailers } = {}) => {
  const parties = { distributors, dealers, retailers };
  const rows = (holders || []).map(u => {
    const party = linkedPartyOf(u, parties);
    return {
      id: u.id,
      user: u,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || party?.phone || '',
      party,
      managers: party ? [] : managersOf(u, users),
      status: memberStatus(u),
    };
  });
  const dup = duplicateFlags(rows);
  return rows.map(r => ({ ...r, duplicateOf: dup[r.id] || [] }));
};

/** What the Members search matches: name, e-mail, phone, linked party. */
export const memberSearchText = (r) =>
  [r.name, r.email, r.phone, r.party?.name, r.party?.kind, ...(r.managers || [])].filter(Boolean).join(' ');

/** Where "View" goes: the partner's own record, else the person on Team Members. */
export const memberViewPath = (r, partnerLogin) => {
  if (r.party?.found) return `${r.party.path}?view=${encodeURIComponent(r.party.id)}`;
  const q = encodeURIComponent(r.email || r.name || '');
  return `/masters/team?${partnerLogin ? 'tab=partners&' : ''}q=${q}`;
};
