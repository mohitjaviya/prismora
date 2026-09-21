/**
 * The duplicate-account check on the three signup forms.
 *
 * It used to be `users.some(u => u.email === form.email)`, run against a list
 * that is always empty on a signup page -- the visitor has no account, so the
 * read is anonymous and RLS returns nothing. The check passed for every email
 * ever typed, including ones that were already registered, and the real
 * rejection arrived later from Supabase Auth as a message about the auth
 * system rather than a sentence about having an account already.
 *
 * 028_email_taken.sql replaces the list with a question: one address in, one
 * boolean out. The decisions about when to ask and what to do with silence are
 * here, where they can be tested.
 */

/** Trimmed and lower-cased — the form of an address two spellings share. */
export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

/**
 * Whether an address is worth asking about yet.
 *
 * Not validation -- the input is `type="email"` and the browser does that. This
 * is about not sending half-typed addresses to the database on the way to a
 * whole one, and not asking a question whose answer is meaningless.
 */
export const looksLikeEmail = (email) => {
  const value = normaliseEmail(email);
  if (value.length < 5) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !/\s/.test(value);
};

/**
 * What to do with the answer.
 *
 * A failed check does not block. The authority on whether an email can be used
 * is signUp, which refuses a duplicate regardless; this only exists to say so
 * in advance, in plain words. Blocking on a failed lookup would turn a dropped
 * connection -- or 028 not having been run yet -- into a signup form that
 * nobody can get past, which is a worse outcome than the message it was
 * meant to improve.
 */
export const emailCheckVerdict = ({ taken, failed } = {}) => {
  if (failed) return { block: false, error: '' };
  if (taken) {
    return {
      block: true,
      error: 'An account with this email already exists. Sign in instead, or use a different address.',
    };
  }
  return { block: false, error: '' };
};

/**
 * Asks the database, through the function 028 creates.
 *
 * The client is passed in rather than imported so this can be tested without
 * one. Every failure -- no client, a malformed address, an error, the RPC not
 * existing because the migration has not been run -- comes back as
 * `failed: true`, which the verdict above treats as "carry on".
 */
export async function checkEmailTaken(client, email) {
  if (!looksLikeEmail(email)) return { taken: false, failed: true, reason: 'not an address' };
  if (!client?.rpc) return { taken: false, failed: true, reason: 'no client' };

  let result;
  try {
    result = await client.rpc('email_taken', { p_email: normaliseEmail(email) });
  } catch (err) {
    // supabase-js returns { error } rather than throwing; this catches the
    // layer below it, which is what being offline looks like.
    return { taken: false, failed: true, reason: err?.message || String(err) };
  }

  if (result?.error) {
    return { taken: false, failed: true, reason: result.error.message || String(result.error) };
  }
  // The function returns a boolean and nothing else. Anything that is not
  // exactly `true` is treated as "not taken" rather than coerced, so a shape
  // this does not recognise cannot block a legitimate signup.
  return { taken: result?.data === true, failed: false, reason: null };
}
