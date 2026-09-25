import { describe, it, expect } from 'vitest';
import { dataSessionKey, shouldFetchData, dataCacheKeysToClear, loadingView } from '../dataSession';

const ANKITA = { id: 'U-ankita', role: 'Sales Executive' };
const ADMIN = { id: '1', role: 'Admin' };

describe('shouldFetchData - the data layer fetches only as someone', () => {
  // The bug: the one fetch ran on the login page, as nobody, and every table
  // came back empty. Signing in never fetched again.
  it('does not fetch on the login page', () => {
    expect(shouldFetchData({ authReady: true, user: null })).toBe(false);
  });

  it('does not fetch before the session is known, even with a remembered user', () => {
    expect(shouldFetchData({ authReady: false, user: ANKITA })).toBe(false);
  });

  it('fetches once signed in', () => {
    expect(shouldFetchData({ authReady: true, user: ANKITA })).toBe(true);
  });
});

describe('dataSessionKey - a new user means a fresh load', () => {
  it('changes when someone signs in, so the data is fetched again', () => {
    expect(dataSessionKey({ authReady: true, user: null }))
      .not.toBe(dataSessionKey({ authReady: true, user: ANKITA }));
  });

  it('changes between two users on the same browser', () => {
    expect(dataSessionKey({ authReady: true, user: ADMIN }))
      .not.toBe(dataSessionKey({ authReady: true, user: ANKITA }));
  });

  it('changes once the session is confirmed', () => {
    expect(dataSessionKey({ authReady: false, user: ANKITA }))
      .not.toBe(dataSessionKey({ authReady: true, user: ANKITA }));
  });

  it('stays the same for the same user, so it does not reload for nothing', () => {
    expect(dataSessionKey({ authReady: true, user: { ...ANKITA } }))
      .toBe(dataSessionKey({ authReady: true, user: ANKITA }));
  });
});

describe('dataCacheKeysToClear - what signing out leaves behind', () => {
  const keys = [
    'prismora_orders', 'prismora_product_catalog', 'prismora_visit_reports', 'prismora_users',
    'prismora_theme', 'prismora_data_version', 'prismora_monthly_target', 'prismora_ytd_target',
    'sb-qvck-auth-token', 'something_else', 'prismora_notifications_U-ankita',
  ];

  it("drops the last person's cached tables", () => {
    expect(dataCacheKeysToClear(keys)).toEqual([
      'prismora_orders', 'prismora_product_catalog', 'prismora_visit_reports', 'prismora_users',
    ]);
  });

  it("keeps this browser's preferences and anything not the app's", () => {
    const cleared = dataCacheKeysToClear(keys);
    for (const k of ['prismora_theme', 'prismora_data_version', 'prismora_monthly_target', 'sb-qvck-auth-token', 'prismora_notifications_U-ankita']) {
      expect(cleared).not.toContain(k);
    }
  });
});

describe('loadingView - never a blank screen on first load', () => {
  it('shows a loading screen when there is nothing cached to show', () => {
    expect(loadingView({ status: 'loading', hadCache: false })).toBe('full');
  });

  it('shows the cached copy with a small notice when there is one', () => {
    expect(loadingView({ status: 'loading', hadCache: true })).toBe('refreshing');
  });

  it('shows nothing extra once loaded, or when nobody is signed in', () => {
    expect(loadingView({ status: 'ready', hadCache: false })).toBeNull();
    expect(loadingView({ status: 'idle', hadCache: false })).toBeNull();
  });
});
