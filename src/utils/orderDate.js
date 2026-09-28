/**
 * An order's date on the form (a day) and in the database (a moment).
 *
 * The form's date field holds a day. Saving turned that day into midnight UTC,
 * so every edited order lost its time — a delivery saved at 4 pm sorted below
 * orders raised that morning, onto a later page — and the day itself was read
 * in UTC, which in India is yesterday until 5:30 am.
 *
 * Now the day is read and written in local time, and an edit that leaves the
 * day alone keeps the order's exact moment.
 */
const pad = (n) => String(n).padStart(2, '0');

/** The local day (YYYY-MM-DD) of a moment. */
export const localDay = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The moment to store for the day chosen on the form. */
export const orderDateToSave = (day, original = null, now = new Date()) => {
  if (!day) return original || now.toISOString();
  if (original && localDay(original) === day) return original;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
};
