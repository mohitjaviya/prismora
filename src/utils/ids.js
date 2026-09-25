/**
 * A long record id, shortened for a table cell.
 *
 * Ids that say where they came from — EXP-INC-1789983894639-SCH-1789983814013
 * for an incentive's expense — run to forty characters and set the width of
 * every column around them. Kept: the prefix that says what kind of record it
 * is, and the last six characters that tell two apart. The full id is always
 * one hover or one click away.
 */
export function shortId(id, keep = 6) {
  const full = String(id ?? '');
  if (full.length <= 14) return full;
  const parts = full.split('-');
  const prefix = parts.length > 1 && /^[A-Za-z]+$/.test(parts[1]) ? `${parts[0]}-${parts[1]}` : parts[0];
  return `${prefix}…${full.slice(-keep)}`;
}

/** What an automatically booked expense came from, by its id. */
export function expenseSource(id) {
  const s = String(id ?? '');
  if (s.startsWith('EXP-INC-')) return 'Incentive';
  if (s.startsWith('EXP-CLM-')) return 'Scheme claim';
  if (s.startsWith('EXP-FLD-')) return 'Field expense';
  return null;
}
