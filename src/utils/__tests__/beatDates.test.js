import { describe, it, expect } from 'vitest';
import {
  localDateStr, beatTiming, checkInState, canRequestEarly, canDecideRequest,
  isOpenRequest, isApprovedForToday, isMissedBeat, beatDisplayStatus,
} from '../beatDates';

const TODAY = '2026-09-24';
const TOMORROW = '2026-09-25';
const YESTERDAY = '2026-09-23';

const ABHI = { id: 'U-abhi', role: 'Sales Executive', managedUsers: [] };
const MANAGER = { id: 'U-mgr', role: 'Sales Manager', managedUsers: ['U-abhi', 'U-ankita'] };
const OTHER_MANAGER = { id: 'U-mgr2', role: 'Sales Manager', managedUsers: ['U-someone-else'] };
const ADMIN = { id: '1', role: 'Admin', managedUsers: [] };
const DIRECTOR = { id: 'U-dir', role: 'Director', managedUsers: [] };

const beat = (date, extra = {}) => ({ id: 'B-1', executiveId: 'U-abhi', date, outlets: ['Shiv medicals'], outletVisits: {}, status: 'Planned', ...extra });
const request = (extra = {}) => ({
  id: 'ECR-1', beatId: 'B-1', requestedBy: 'U-abhi', requestedFor: TODAY,
  reason: 'I am near this outlet today', status: 'Pending', createdAt: `${TODAY}T05:00:00Z`, ...extra,
});
const stateOf = (b, requests = []) => checkInState({ beat: b, today: TODAY, requests, userId: 'U-abhi' });

describe('localDateStr - the day as the device sees it', () => {
  // The bug: toISOString() gives the UTC date, a day behind in India until
  // 5:30 am. 1 am on the 24th in India is 19:30 on the 23rd in UTC.
  it('uses local time, not UTC', () => {
    const oneAmLocal = new Date(2026, 8, 24, 1, 0, 0);
    expect(localDateStr(oneAmLocal)).toBe('2026-09-24');
  });

  it('pads month and day', () => {
    expect(localDateStr(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('on-date check-in', () => {
  it('is open on the beat date, with no request needed', () => {
    expect(beatTiming(beat(TODAY), TODAY)).toBe('today');
    expect(stateOf(beat(TODAY))).toMatchObject({ canCheckIn: true, state: 'open' });
    expect(canRequestEarly({ beat: beat(TODAY), today: TODAY, requests: [], userId: 'U-abhi' })).toBe(false);
  });
});

describe('early check-in is blocked', () => {
  it('blocks a beat whose date is still ahead', () => {
    expect(stateOf(beat(TOMORROW))).toMatchObject({ canCheckIn: false, state: 'early' });
  });

  it('offers a request instead', () => {
    expect(canRequestEarly({ beat: beat(TOMORROW), today: TODAY, requests: [], userId: 'U-abhi' })).toBe(true);
  });
});

describe('the request', () => {
  it('keeps the beat blocked while it waits', () => {
    expect(stateOf(beat(TOMORROW), [request()])).toMatchObject({ canCheckIn: false, state: 'pending' });
  });

  it('cannot be made twice while one is waiting', () => {
    expect(canRequestEarly({ beat: beat(TOMORROW), today: TODAY, requests: [request()], userId: 'U-abhi' })).toBe(false);
  });

  it('is only the requesting rep\'s own', () => {
    const ankitas = request({ requestedBy: 'U-ankita' });
    expect(stateOf(beat(TOMORROW), [ankitas]).state).toBe('early');
  });
});

describe('approval', () => {
  it('opens check-in on that beat for today', () => {
    expect(stateOf(beat(TOMORROW), [request({ status: 'Approved' })])).toMatchObject({ canCheckIn: true, state: 'approved' });
  });

  it('opens only the beat it was for', () => {
    const other = beat(TOMORROW, { id: 'B-2' });
    expect(stateOf(other, [request({ status: 'Approved' })]).canCheckIn).toBe(false);
  });
});

describe('rejection', () => {
  it('keeps the beat blocked and lets the rep ask again', () => {
    const rejected = request({ status: 'Rejected', decisionNote: 'Stick to the plan' });
    expect(stateOf(beat(TOMORROW), [rejected])).toMatchObject({ canCheckIn: false, state: 'rejected' });
    expect(canRequestEarly({ beat: beat(TOMORROW), today: TODAY, requests: [rejected], userId: 'U-abhi' })).toBe(true);
  });

  it('is superseded by a newer request the same day', () => {
    const rejected = request({ id: 'ECR-1', status: 'Rejected', createdAt: `${TODAY}T05:00:00Z` });
    const again = request({ id: 'ECR-2', status: 'Pending', createdAt: `${TODAY}T06:00:00Z` });
    expect(stateOf(beat(TOMORROW), [rejected, again]).state).toBe('pending');
  });

  it('leaves the rep waiting for the date as normal', () => {
    const rejected = request({ status: 'Rejected' });
    const onTheDay = checkInState({ beat: beat(TOMORROW), today: TOMORROW, requests: [rejected], userId: 'U-abhi' });
    expect(onTheDay).toMatchObject({ canCheckIn: true, state: 'open' });
  });
});

describe('lapsing at midnight', () => {
  const twoDaysOut = '2026-09-27';

  it('does not carry an approval over to the next day', () => {
    const approvedYesterday = request({ requestedFor: YESTERDAY, status: 'Approved' });
    expect(isApprovedForToday(approvedYesterday, TODAY)).toBe(false);
    expect(stateOf(beat(twoDaysOut), [approvedYesterday])).toMatchObject({ canCheckIn: false, state: 'early' });
  });

  it('lets an undecided request lapse too, so it stops showing as waiting', () => {
    const askedYesterday = request({ requestedFor: YESTERDAY, status: 'Pending' });
    expect(isOpenRequest(askedYesterday, TODAY)).toBe(false);
    expect(stateOf(beat(twoDaysOut), [askedYesterday]).state).toBe('early');
    expect(canRequestEarly({ beat: beat(twoDaysOut), today: TODAY, requests: [askedYesterday], userId: 'U-abhi' })).toBe(true);
  });

  it('cannot be approved once it has lapsed', () => {
    const askedYesterday = request({ requestedFor: YESTERDAY });
    expect(canDecideRequest({ approver: ADMIN, approverLevel: 'admin', canEditSfa: true, request: askedYesterday, today: TODAY })).toBe(false);
  });
});

describe('who decides', () => {
  const decides = (approver, level, canEditSfa = true, req = request()) =>
    canDecideRequest({ approver, approverLevel: level, canEditSfa, request: req, today: TODAY });

  it('lets nobody approve their own request', () => {
    expect(decides(ABHI, 'sales')).toBe(false);
    const adminsOwn = request({ requestedBy: '1' });
    expect(decides(ADMIN, 'admin', true, adminsOwn)).toBe(false);
    const managersOwn = request({ requestedBy: 'U-mgr' });
    expect(decides(MANAGER, 'manager', true, managersOwn)).toBe(false);
  });

  it('lets a manager decide for their own team', () => {
    expect(decides(MANAGER, 'manager')).toBe(true);
  });

  it('does not let a manager decide for another team', () => {
    expect(decides(OTHER_MANAGER, 'manager')).toBe(false);
  });

  it('lets an admin decide for anyone', () => {
    expect(decides(ADMIN, 'admin')).toBe(true);
  });

  it('shows Director the request but does not let them decide it', () => {
    // Director is admin level, but SFA is view-only for the role.
    expect(decides(DIRECTOR, 'admin', false)).toBe(false);
  });

  it('does not let a rep decide a teammate\'s request', () => {
    const ankitas = request({ requestedBy: 'U-ankita' });
    expect(decides(ABHI, 'sales', true, ankitas)).toBe(false);
  });

  it('does not reopen a decided request', () => {
    expect(decides(ADMIN, 'admin', true, request({ status: 'Approved' }))).toBe(false);
    expect(decides(ADMIN, 'admin', true, request({ status: 'Rejected' }))).toBe(false);
  });
});

describe('missed beats', () => {
  it('marks a past beat with outlets left as Missed, and read-only', () => {
    expect(isMissedBeat(beat(YESTERDAY), TODAY)).toBe(true);
    expect(beatDisplayStatus(beat(YESTERDAY), TODAY)).toBe('Missed');
    expect(stateOf(beat(YESTERDAY))).toMatchObject({ canCheckIn: false, state: 'missed' });
    expect(canRequestEarly({ beat: beat(YESTERDAY), today: TODAY, requests: [], userId: 'U-abhi' })).toBe(false);
  });

  it('leaves a past beat that was finished as it was', () => {
    const finished = beat(YESTERDAY, { status: 'Completed', outletVisits: { 'Shiv medicals': { outcome: 'Visited' } } });
    expect(isMissedBeat(finished, TODAY)).toBe(false);
    expect(beatDisplayStatus(finished, TODAY)).toBe('Completed');
  });

  it('does not let an approval reopen a past beat', () => {
    expect(stateOf(beat(YESTERDAY), [request({ status: 'Approved' })]).canCheckIn).toBe(false);
  });
});
