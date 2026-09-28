/**
 * Which account statuses may use the app.
 *
 * The same blocklist the database applies in my_role_name() (029, 043), so the
 * screen and the data agree on who is in. A blocklist rather than "Active
 * only", for 029's reason: an unexpected status must not lock everyone out.
 */
export const BLOCKED_STATUSES = ['Pending', 'Rejected', 'Inactive'];

export const isBlockedStatus = (status) => BLOCKED_STATUSES.includes(status);

/** What login() reports for a blocked account: 'pending', 'rejected' or 'inactive'. */
export const blockedLoginResult = (status) => (isBlockedStatus(status) ? status.toLowerCase() : null);

/** Why someone was just signed out, shown once on the sign-in screen. */
export const SIGNED_OUT_REASON_KEY = 'prismoraSignedOutReason';

export const signedOutMessage = (status) => ({
  Inactive: 'Your account has been deactivated, so you have been signed out. Contact your administrator.',
  Rejected: 'Your registration was not approved. Please contact support.',
  Pending: 'Your account is awaiting admin approval. Please check back soon.',
}[status] || null);
