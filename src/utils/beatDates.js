/**
 * When a rep may check in on a beat, and the early check-in request that
 * lets them do it before the beat's date.
 *
 *   · on the beat's date          — check in, no request needed
 *   · before it                   — blocked, unless a request made for today
 *                                   has been approved (it lapses at midnight)
 *   · after it, with outlets left — Missed, read-only (late logging is a
 *                                   separate, later piece of work)
 *
 * The database enforces the same window (037_early_checkin_requests.sql), so
 * a rep cannot step around it by calling the API.
 */

/**
 * Today's date as YYYY-MM-DD in this device's own time zone.
 *
 * `new Date().toISOString().split('T')[0]` gives the UTC date, which in India
 * is still yesterday until 5:30 in the morning — so a visit logged at 1 am was
 * dated the day before, and a beat for "today" read as tomorrow's.
 */
export const localDateStr = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const beatDay = (beat) => String(beat?.date || '').slice(0, 10);

/** 'early' before the beat's date, 'today' on it, 'past' after it. */
export const beatTiming = (beat, today) => {
  const day = beatDay(beat);
  if (day > today) return 'early';
  if (day === today) return 'today';
  return 'past';
};

const outletsOf = (beat) => (Array.isArray(beat?.outlets) ? beat.outlets : []);
const allOutletsRecorded = (beat) => {
  const visits = beat?.outletVisits || {};
  const outlets = outletsOf(beat);
  return outlets.length > 0 && outlets.every(o => visits[o]);
};

/** A beat whose date has passed with outlets still unrecorded. */
export const isMissedBeat = (beat, today) => beatTiming(beat, today) === 'past' && !allOutletsRecorded(beat);

/** The status to show: a stored status, or Missed for a beat that ran out of days. */
export const beatDisplayStatus = (beat, today) => (isMissedBeat(beat, today) ? 'Missed' : beat?.status);

/** The rep's requests for this beat, newest first. */
const requestsFor = (beat, requests, userId) =>
  (requests || [])
    .filter(r => r.beatId === beat?.id && (!userId || r.requestedBy === userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

/** An approval counts on the day it was asked for, and no other. */
export const isApprovedForToday = (request, today) =>
  request?.status === 'Approved' && request?.requestedFor === today;

/**
 * A request still waiting on a decision. One from an earlier day has lapsed:
 * it asked to check in on a day that is over, so approving it now would grant
 * nothing, and it no longer shows as waiting.
 */
export const isOpenRequest = (request, today) =>
  request?.status === 'Pending' && request?.requestedFor === today;

/**
 * Whether a rep may check in on a beat today, and why not if they may not.
 *
 * `state` is one of:
 *   'open'      — the beat is today's
 *   'approved'  — early, with a request approved for today
 *   'pending'   — early, a request is waiting for a decision
 *   'rejected'  — early, today's request was turned down (they may ask again)
 *   'early'     — early, nothing asked yet (or only on earlier days)
 *   'missed'    — the date has passed
 */
export const checkInState = ({ beat, today, requests, userId }) => {
  const timing = beatTiming(beat, today);
  if (timing === 'today') return { canCheckIn: true, state: 'open', request: null };
  if (timing === 'past') return { canCheckIn: false, state: 'missed', request: null };

  // Only today's requests count, decided or not; earlier ones have lapsed.
  const todays = requestsFor(beat, requests, userId).find(r => r.requestedFor === today);
  if (isOpenRequest(todays, today)) return { canCheckIn: false, state: 'pending', request: todays };
  if (isApprovedForToday(todays, today)) return { canCheckIn: true, state: 'approved', request: todays };
  if (todays?.status === 'Rejected') return { canCheckIn: false, state: 'rejected', request: todays };
  return { canCheckIn: false, state: 'early', request: null };
};

/** Whether a rep may ask to check in early on this beat today. */
export const canRequestEarly = (args) => ['early', 'rejected'].includes(checkInState(args).state);

/**
 * Whether `approver` may approve or reject `request`.
 *
 * Admin level with full SFA access decides anyone's; a manager with full SFA
 * access decides their own team's (managedUsers). Director is admin level but
 * has view-only SFA, so sees requests without deciding them. Nobody decides
 * their own, a decided request stays decided, and a lapsed one (asked on an
 * earlier day) can no longer be decided.
 */
export const canDecideRequest = ({ approver, approverLevel, canEditSfa, request, today }) => {
  if (!approver || !isOpenRequest(request, today)) return false;
  if (!canEditSfa) return false;
  if (request.requestedBy === approver.id) return false;
  if (approverLevel === 'admin') return true;
  if (approverLevel === 'manager') return (approver.managedUsers || []).includes(request.requestedBy);
  return false;
};
