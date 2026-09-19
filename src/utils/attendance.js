/**
 * How long a shift actually lasted.
 *
 * The register printed "~8h" for every completed shift, whatever the times
 * beside it said: a punch-in at 11:08 and a punch-out at 11:09 read as a full
 * working day. Attendance is what hours are paid from, so a number that is not
 * the real one is worse than showing none at all.
 *
 * Times are written by toLocaleTimeString with hour and minute only, so they
 * arrive as "11:08 AM" on this machine and as "23:08" in a 24-hour locale.
 * Both are read here, because the string in the database was produced by
 * whichever browser did the punching.
 */

const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$|^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Minutes since midnight, or null if this is not a time. */
export function parseClockTime(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(CLOCK);
  if (!m) return null;

  const twelveHour = m[4] !== undefined;
  let hours = Number(twelveHour ? m[1] : m[5]);
  const minutes = Number(twelveHour ? m[2] : m[6]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;

  if (twelveHour) {
    if (hours < 1 || hours > 12) return null;
    const pm = m[4].toLowerCase() === 'p';
    if (pm) hours = hours === 12 ? 12 : hours + 12;
    else hours = hours === 12 ? 0 : hours;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Minutes between two punches, or null if either is unreadable.
 *
 * A shift that ends before it starts ran through midnight rather than
 * backwards, which is ordinary for a late beat.
 */
export function shiftMinutes(checkIn, checkOut) {
  const start = parseClockTime(checkIn);
  const end = parseClockTime(checkOut);
  if (start === null || end === null) return null;
  return end >= start ? end - start : (24 * 60 - start) + end;
}

/** "3h 25m", "45m", "6h". Short enough to sit in a table badge. */
export function formatDuration(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return '<1m';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * What the Duration column shows: a real length once the shift is closed,
 * "Active" while it is still open, and an em dash when nothing was punched.
 */
export function shiftDuration(checkIn, checkOut) {
  if (!checkIn) return '—';
  if (!checkOut) return 'Active';
  const minutes = shiftMinutes(checkIn, checkOut);
  return minutes === null ? '—' : formatDuration(minutes);
}
