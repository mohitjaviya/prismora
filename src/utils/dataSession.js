/**
 * When the app's data belongs to whom.
 *
 * The data layer used to fetch once, when the app first mounted — which is on
 * the login page, before anyone has signed in. Every table's security rules
 * return nothing to a visitor, so the fetch came back empty, was taken for
 * genuinely empty tables and cached, and signing in did not fetch again. A new
 * device showed blank screens until a hard refresh remounted it with a
 * session. And signing out left the last person's data in memory and in the
 * cache for whoever signed in next.
 *
 * So the data layer is keyed on the signed-in user: it is rebuilt, and
 * fetches, each time that changes — and only once the session is known.
 */

/** The key the data layer is mounted under; a new key means a fresh load. */
export const dataSessionKey = ({ authReady, user }) => {
  if (!authReady) return 'pending';
  return user?.id ? `user:${user.id}` : 'signed-out';
};

/** Whether this mount may fetch: only with a confirmed, signed-in session. */
export const shouldFetchData = ({ authReady, user }) => Boolean(authReady && user?.id);

// Preferences of this browser, not data belonging to whoever was signed in.
const KEEP_ON_SIGN_OUT = new Set([
  'prismora_theme', 'prismora_data_version', 'prismora_monthly_target', 'prismora_ytd_target',
]);

/**
 * The cached tables to drop when nobody is signed in. Saved notifications are
 * kept: each set is already filed under its own user's id.
 */
export const dataCacheKeysToClear = (keys) =>
  (keys || []).filter(k => k.startsWith('prismora_')
    && !KEEP_ON_SIGN_OUT.has(k)
    && !k.startsWith('prismora_notifications_'));

/**
 * What to show while the first fetch is in flight.
 *
 *   'full'       — nothing cached to show yet (a new device, or just signed
 *                  in): a loading screen, not empty tables that look broken
 *   'refreshing' — this browser's cached copy is on screen: a small notice
 *   null         — loaded, or nobody signed in
 */
export const loadingView = ({ status, hadCache }) => {
  if (status !== 'loading') return null;
  return hadCache ? 'refreshing' : 'full';
};
