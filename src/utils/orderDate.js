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

/**
 * The India-time day (YYYY-MM-DD) of a moment, whatever the browser's zone.
 * For text written into a record, read later by anyone: a UTC day put a PO
 * cancelled at 00:30 IST on 3 Oct down as "Cancelled on 2026-10-02".
 */
export const indiaDay = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

/**
 * Is a moment within a from/to day range, both days whole and India time?
 * A bare "2026-09-29" reads as UTC midnight, which cut 00:00–05:30 IST off
 * the "from" day (carry-over finding 1: Invoice Register showed 8 of 12).
 */
export const inIndiaDayRange = (value, from, to) => {
  if (!from && !to) return true;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < new Date(`${from}T00:00:00+05:30`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999+05:30`).getTime()) return false;
  return true;
};

/** The moment to store for the day chosen on the form. */
export const orderDateToSave = (day, original = null, now = new Date()) => {
  if (!day) return original || now.toISOString();
  if (original && localDay(original) === day) return original;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
};
