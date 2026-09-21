/**
 * What the three public signup pages send, and how to read what comes back.
 *
 * The pages used to write to the database from the browser. A visitor filling
 * in a signup form has no account, so those writes went out as `anon`, and no
 * policy grants anon INSERT on anything -- Postgres refused the partner row and
 * the page showed "Registration submitted" regardless, because neither call
 * throws on failure. Every public signup was a thank-you note over an empty
 * database.
 *
 * The writes moved to the partner-signup Edge Function, which holds the
 * service key and decides what a signup may contain. What is left here is the
 * part with decisions in it: what to send, what is worth refusing before the
 * round-trip, and -- the part that was actually broken -- what counts as
 * success.
 */

import { looksLikeEmail, normaliseEmail } from './signupChecks';

/** The three kinds, and the words each one needs on screen. */
export const SIGNUP_KINDS = {
  distributor: { role: 'Distributor', parentField: null, parentLabel: null },
  dealer: { role: 'Dealer', parentField: 'parentDistributorId', parentLabel: 'distributor' },
  retailer: { role: 'Retailer', parentField: 'parentDealerId', parentLabel: 'dealer' },
};

/**
 * What is worth refusing without asking the server.
 *
 * Not a security check -- the function validates everything again, because
 * anything the browser decides can be skipped by not using the browser. This
 * only saves a round-trip on a form somebody has visibly not finished.
 */
export function validateSignup(kind, form = {}) {
  const spec = SIGNUP_KINDS[kind];
  if (!spec) return { ok: false, error: 'Unknown registration type.' };

  const need = [
    [form.name, 'Enter your business name.'],
    [form.contactPerson, 'Enter a contact person.'],
    [form.phone, 'Enter a phone number.'],
    [form.state, 'Choose your state.'],
    [form.city, 'Choose your city or district.'],
  ];
  for (const [value, message] of need) {
    if (!String(value ?? '').trim()) return { ok: false, error: message };
  }

  if (!looksLikeEmail(form.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (String(form.password ?? '').length < 8) {
    return { ok: false, error: 'The password must be at least 8 characters.' };
  }
  if (spec.parentField && !String(form[spec.parentField] ?? '').trim()) {
    return { ok: false, error: `Choose the ${spec.parentLabel} you buy through.` };
  }
  return { ok: true };
}

/**
 * The request body.
 *
 * Note what is absent: status, role, creditLimit, outstandingAmount. Those are
 * decided by the function, because a request is a claim and a stranger claiming
 * `status: 'Active'` is the thing this whole arrangement exists to prevent.
 */
export function signupPayload(kind, form = {}) {
  const spec = SIGNUP_KINDS[kind];
  if (!spec) return null;

  const payload = {
    kind,
    name: String(form.name ?? '').trim(),
    contactPerson: String(form.contactPerson ?? '').trim(),
    email: normaliseEmail(form.email),
    password: String(form.password ?? ''),
    phone: String(form.phone ?? '').trim(),
    state: String(form.state ?? '').trim(),
    city: String(form.city ?? '').trim(),
    gstin: String(form.gstin ?? '').trim().toUpperCase(),
    territoryId: String(form.territoryId ?? '').trim() || null,
  };
  if (spec.parentField) payload[spec.parentField] = String(form[spec.parentField] ?? '').trim();
  return payload;
}

/**
 * Whether a registration actually happened.
 *
 * This is the function the bug was missing. The old page called
 * `setSubmitted(true)` unconditionally, so a refused write and a saved one
 * looked identical to the person who had just typed their business details in.
 * Nothing is success here unless the server said `ok`.
 *
 * supabase-js reports every non-2xx as the same sentence -- "Edge Function
 * returned a non-2xx status code" -- and puts the response on `error.context`.
 * The real reason has to be unwrapped by the caller and passed in as `detail`,
 * the same way createUserAccount does it.
 */
export function signupOutcome({ data, error, detail } = {}) {
  if (error) {
    const message = String(error.message || error);
    // Not deployed is worth telling apart from refused: one is a setup step,
    // the other is an answer. A visitor cannot act on either, but whoever
    // reads the console can.
    const needsDeploy = /not found|404|failed to fetch|failed to send/i.test(message);
    return {
      ok: false,
      needsDeploy,
      error: detail || (needsDeploy
        ? 'Registration is not available right now. Please try again later or contact us directly.'
        : message),
    };
  }

  if (data?.error) return { ok: false, needsDeploy: false, error: String(data.error) };

  // A 200 with no `ok` is not success. It is a shape nobody planned for, and
  // treating it as success is exactly the failure being fixed.
  if (!data?.ok) {
    return { ok: false, needsDeploy: false, error: 'Registration did not complete. Please try again.' };
  }

  return {
    ok: true,
    partnerId: data.partnerId || null,
    emailConfirmationRequired: data.emailConfirmationRequired !== false,
  };
}

/**
 * What the success screen says.
 *
 * Two different things, because there are two different next steps. If the
 * address has to be confirmed, saying only "we will review it" leaves an email
 * sitting unopened and a person wondering why approval never came.
 */
export function successMessage(businessName, { emailConfirmationRequired } = {}) {
  const who = String(businessName ?? '').trim() || 'your business';
  const base = `Thanks — the registration for ${who} is with our team for approval.`;
  return emailConfirmationRequired
    ? `${base} We have sent a confirmation link to your email address: please open it, then you'll be able to sign in once the registration is approved.`
    : `${base} You'll be able to sign in once it is approved.`;
}
