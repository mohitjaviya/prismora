/**
 * Month labels that do not depend on the browser's idea of "short".
 *
 * Three screens built a key with `toLocaleString('default', { month: 'short' })`
 * and then matched it against a hardcoded ['Jan'...'Dec'] list. Current ICU
 * renders September as "Sept", not "Sep", so every September order failed the
 * match and vanished from the revenue trend and the monthly accounting chart.
 * Nothing errored: the month was simply absent, which looks like a month with
 * no sales rather than a bug.
 *
 * The abbreviation comes from the month number here, so the key and the list it
 * is compared against can never disagree.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Sep' for any date in September, in every locale and every ICU version. */
export const monthKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : MONTHS[d.getMonth()];
};

/** 'Sep 2026' — for charts that span more than one year. */
export const monthYearKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
