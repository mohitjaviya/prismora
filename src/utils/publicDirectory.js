/**
 * The lists a signup page has to offer somebody who has no account yet.
 *
 * A visitor to DealerSignup is anonymous, and under the RLS policies in force
 * an anonymous SELECT on `distributors` returns HTTP 200 with zero rows. Not an
 * error -- an empty list. So a required dropdown rendered with nothing in it,
 * and the territory field was a free text box because there was no list to
 * offer. Confirmed against the live database before this was written.
 *
 * 026_public_signup_directory.sql adds three views holding only the columns a
 * dropdown needs -- id, name, and a territory name -- and grants anon SELECT on
 * those. Nothing here reads a base table.
 *
 * The decisions are separated from the fetching so they can be tested: what a
 * row is called in the list, what order the list is in, and what to say when
 * the list is empty, which is the case that was silently wrong for the whole
 * life of these pages.
 */

/** The views 026 creates. Named here so a typo is one place, not three. */
export const PUBLIC_VIEWS = {
  territories: 'public_territories',
  distributors: 'public_distributors',
  dealers: 'public_dealers',
};

/**
 * What a partner is called in a dropdown.
 *
 * The territory in brackets is what tells two "Shree Traders" apart, so it is
 * worth showing -- but only when there is one. "Shree Traders ()" reads as a
 * bug, and before 024 that is exactly what an unassigned partner produced.
 */
export const partnerLabel = (row) => {
  const name = String(row?.name ?? '').trim();
  const territory = String(row?.territoryName ?? '').trim();
  if (!name) return '';
  return territory ? `${name} (${territory})` : name;
};

/**
 * What a territory is called in a dropdown.
 *
 * Same shape, different field: a territory carries its own state rather than a
 * territory name.
 */
export const territoryLabel = (row) => {
  const name = String(row?.name ?? '').trim();
  const state = String(row?.state ?? '').trim();
  if (!name) return '';
  return state ? `${name} (${state})` : name;
};

/**
 * Alphabetical, and rows without a name dropped.
 *
 * A nameless row cannot be chosen meaningfully and cannot be labelled, so it
 * would render as a blank option that silently submits an id.
 */
export const sortedByName = (rows = []) =>
  (rows || [])
    .filter(r => r?.id && String(r?.name ?? '').trim())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

/**
 * What the placeholder option says.
 *
 * An empty list on a required field is the state that has to be legible: the
 * page cannot be completed, and "-- Select --" above nothing does not say so.
 * A failed fetch is told apart from a genuinely empty list, because one is
 * worth retrying and the other is worth telephoning about.
 */
export const directoryMessage = ({ loading, failed, count, what = 'options' } = {}) => {
  if (loading) return `Loading ${what}…`;
  if (failed) return `Could not load ${what} — check your connection and reload.`;
  if (!count) return `No ${what} available yet — leave this and our team will set it on approval.`;
  return `— Select —`;
};

/**
 * Reads one of the public views.
 *
 * The client is passed in rather than imported, so this can be tested without a
 * database and so nothing here can reach a table that is not one of the three.
 * An unknown view name is refused rather than sent, because the failure of a
 * mistyped table name under PostgREST is a 404 that looks like the migration
 * not having been run.
 */
export async function fetchPublicDirectory(client, view) {
  if (!Object.values(PUBLIC_VIEWS).includes(view)) {
    return { rows: [], failed: true, error: `Not a public view: ${view}` };
  }
  if (!client?.from) return { rows: [], failed: true, error: 'No database client.' };

  let result;
  try {
    result = await client.from(view).select('*');
  } catch (err) {
    // supabase-js returns { error } rather than throwing, so this catches the
    // layer below it -- fetch itself failing, which is what being offline
    // looks like.
    return { rows: [], failed: true, error: err?.message || String(err) };
  }

  if (result?.error) {
    return { rows: [], failed: true, error: result.error.message || String(result.error) };
  }
  // A real empty list is not a failure. It is the answer, and the caller says
  // so differently.
  return { rows: sortedByName(result?.data || []), failed: false, error: null };
}
