/**
 * What a status word means, when nobody has said.
 *
 * Only a fallback: an option with a colour set in Master Lists uses that
 * instead, because whoever added the option chose it deliberately. Matched on a
 * normalised substring so 'Partially Paid' and 'Payment Pending' land somewhere
 * sensible rather than all going grey.
 *
 * It lives here rather than beside the Badge so that file exports only
 * components, which is what lets Vite hot-reload it.
 */
const WORDS = [
  [/cancel|reject|fail|lost|overdue|block|inactive|expired|return/, 'danger'],
  [/pending|hold|await|draft|partial|process|transit|review|due/, 'warning'],
  [/deliver|paid|approv|complet|active|success|confirm|won|clear|receiv|closed/, 'success'],
  [/new|fresh|open|assign|schedul|planned/, 'info'],
];

export const toneFor = (label) => {
  const s = String(label || '').toLowerCase();
  const hit = WORDS.find(([re]) => re.test(s));
  return hit ? hit[1] : 'neutral';
};
