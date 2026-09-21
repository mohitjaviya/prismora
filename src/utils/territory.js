/**
 * Which territory a record belongs to.
 *
 * `territory` held a name and nothing checked it was a real one. This database
 * held three distributors on territories that did not exist, and two spellings
 * of Gujarat treated as different places. `territoryId` replaced it: 024 added
 * the id beside the name, the sixty-one places that read the name were
 * converted, and 027 dropped the name.
 *
 * The fallback to the string is still here, and is not dead. A browser that
 * ran the previous build has rows in localStorage carrying a name and no id,
 * and those are what it serves when a fetch fails. Reading them is the whole
 * point of keeping a cache; showing a dash where a territory used to be is not.
 */

/** The territory a record points at, by id first and name second. */
export function territoryFor(territories, record) {
  if (!record) return null;
  const list = territories || [];

  if (record.territoryId) {
    const byId = list.find(t => t?.id === record.territoryId);
    if (byId) return byId;
  }

  const name = String(record.territory || '').trim().toLowerCase();
  if (!name) return null;
  return list.find(t => String(t?.name || '').trim().toLowerCase() === name) || null;
}

/**
 * What to show on screen.
 *
 * A record carrying a name that matches no territory gets the name back rather
 * than a blank — it is what somebody typed, and hiding it would hide the
 * problem. An unassigned record gets an em dash.
 */
export function territoryName(territories, record) {
  const match = territoryFor(territories, record);
  if (match) return match.name;
  const legacy = String(record?.territory || '').trim();
  return legacy || '—';
}

/**
 * True when a record names a territory that does not exist.
 *
 * The state three of this database's distributors were in. A foreign key makes
 * it unrepresentable in the database now, so what is left to catch is a cached
 * row from before the change — worth being able to ask about directly rather
 * than inferring it from a blank on a screen.
 */
export function hasDanglingTerritory(territories, record) {
  if (!record) return false;
  if (record.territoryId) return !territoryFor(territories, record);
  const legacy = String(record.territory || '').trim();
  if (!legacy) return false;
  return !territoryFor(territories, record);
}

/**
 * What to write when a territory is chosen.
 *
 * The id alone. It used to write the name beside it, which is what kept the
 * old column fed through the changeover; 027 dropped that column, and
 * PostgREST refuses an entire statement that names a column the table does not
 * have — so writing it now would refuse every partner, order, lead and beat.
 *
 * It stays a function rather than becoming `{ territoryId: id }` at the call
 * site because it refuses an id that matches no territory. A foreign key would
 * refuse it too, but at the cost of the whole row — losing everything else
 * somebody typed for the sake of one bad value in a dropdown.
 */
export function territoryFields(territories, territoryId) {
  const match = (territories || []).find(t => t?.id === territoryId);
  return { territoryId: match ? match.id : null };
}

/** Records pointing at a territory, by either link. Used before deleting one. */
export function recordsInTerritory(records, territory) {
  if (!territory) return [];
  const name = String(territory.name || '').trim().toLowerCase();
  return (records || []).filter(r =>
    (r?.territoryId && r.territoryId === territory.id)
    || (!r?.territoryId && String(r?.territory || '').trim().toLowerCase() === name)
  );
}
