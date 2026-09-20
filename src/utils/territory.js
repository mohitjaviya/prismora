/**
 * Which territory a record belongs to, while two answers exist.
 *
 * `territory` held a name and nothing checked it was a real one. This database
 * held three distributors on territories that did not exist, and two spellings
 * of Gujarat treated as different places.
 *
 * `territoryId` is the real link now, but sixty-one places still read the name,
 * so both columns are live during the changeover. Everything here prefers the
 * id and falls back to the string, so a record written before the change and
 * one written after both resolve — and so neither has to be special-cased at
 * sixty-one call sites.
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
 * The state three of this database's distributors were in. Worth being able to
 * ask about directly rather than inferring it from a blank on a screen.
 */
export function hasDanglingTerritory(territories, record) {
  if (!record) return false;
  if (record.territoryId) return !territoryFor(territories, record);
  const legacy = String(record.territory || '').trim();
  if (!legacy) return false;
  return !territoryFor(territories, record);
}

/**
 * The pair of fields to write when a territory is chosen.
 *
 * Both, on purpose. The id is the link; the name is kept so the sixty-one
 * places still reading it keep working until they are converted, and so a row
 * still says something legible if its territory is later deleted.
 */
export function territoryFields(territories, territoryId) {
  const match = (territories || []).find(t => t?.id === territoryId);
  return {
    territoryId: match ? match.id : null,
    territory: match ? match.name : '',
  };
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
