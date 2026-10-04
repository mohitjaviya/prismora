/**
 * How a KPI card fits its number (Gap 1).
 *
 * StatCard used to cut long values off ("₹2,29,…") so every card in a row kept
 * the same height. Now the full value is always shown on one line: the font
 * shrinks with the card's width (CSS container units, see `valueFontSize`),
 * from 24px down to a readable 15px. Only a rupee amount of a crore or more
 * gets a short form ("₹2.29 Cr"), and only when the card is too narrow for
 * the full figure at 15px. The full figure stays in the tooltip and on tap.
 */

const CRORE = 1e7;

// Average width of one character of the value, as a share of the font size.
// Digits and ₹ in a heavy sans run ~0.6em and commas far less, so this errs
// towards a smaller font rather than an overflowing one.
export const CHAR_EM = 0.62;

const MAX_REM = 1.5;      // text-2xl, the card's size before Gap 1
const MIN_REM = 0.9375;   // 15px: the smallest size counted as readable
const TAP_MIN_REM = 0.6875; // 11px: only once the user asked for the full figure

/** Text a card shows for `value` (numbers keep their Indian commas). */
export function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-IN') : '';
  return String(value);
}

/**
 * "₹2,29,45,678" -> "₹2.29 Cr"; anything that is not a rupee amount of at
 * least a crore -> null. Reads "₹…", "-₹…" and "−₹…" as the app formats them.
 */
export function shortRupees(text) {
  const m = /^\s*([-−]?)\s*₹\s*([\d,]+(?:\.\d+)?)\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n) || n < CRORE) return null;
  const crore = (n / CRORE).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${m[1]}₹${crore} Cr`;
}

/** CSS font-size: as large as fits `text` across its container, within limits. */
export function valueFontSize(text, { expanded = false } = {}) {
  const len = Math.max(1, [...String(text)].length);
  const floor = expanded ? TAP_MIN_REM : MIN_REM;
  return `min(${MAX_REM}rem, max(${floor}rem, calc(100cqi / ${(len * CHAR_EM).toFixed(2)})))`;
}

// Container width below which the full figure no longer fits at 15px
// (length × CHAR_EM × 15px, rounded up). Written out whole so Tailwind sees
// every class; the pair is [hide the full figure, show the short form].
const SHORT_BELOW = {
  12: ['@max-[7rem]:hidden', 'hidden @max-[7rem]:inline'],
  13: ['@max-[7.75rem]:hidden', 'hidden @max-[7.75rem]:inline'],
  14: ['@max-[8.25rem]:hidden', 'hidden @max-[8.25rem]:inline'],
  15: ['@max-[8.75rem]:hidden', 'hidden @max-[8.75rem]:inline'],
  16: ['@max-[9.375rem]:hidden', 'hidden @max-[9.375rem]:inline'],
  17: ['@max-[10rem]:hidden', 'hidden @max-[10rem]:inline'],
  18: ['@max-[10.5rem]:hidden', 'hidden @max-[10.5rem]:inline'],
};

/**
 * Everything StatCard needs for one value: the full text, the short form (or
 * null), and the classes that swap them on a narrow card. A value longer than
 * the table always shows its short form until tapped.
 */
export function kpiDisplay(value) {
  const full = valueText(value);
  const short = shortRupees(full);
  const len = [...full].length;
  const swap = short ? (SHORT_BELOW[len] || ['hidden', 'inline']) : null;
  return { full, short, fullClass: swap ? swap[0] : '', shortClass: swap ? swap[1] : '' };
}
