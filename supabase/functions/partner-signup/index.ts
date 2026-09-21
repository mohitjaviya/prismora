// PRISMORA — register a channel partner from the public signup pages.
//
// WHY THIS EXISTS
//
// The three signup pages used to do the work in the browser: insert the partner
// row, then call supabase.auth.signUp. A visitor filling in a signup form has no
// account, so both requests go out as `anon` — and no row-level security policy
// grants anon INSERT on anything. Postgres refused the partner row with
//
//     new row violates row-level security policy for table "distributors"
//
// and the page showed "Registration submitted — now under review" anyway,
// because neither call throws on failure. Every public signup was a thank-you
// note over an empty database. Verified against production on 2026-09-21.
//
// Widening RLS to let anon write would mean a stranger could insert rows into
// the partner tables directly, with whatever status, credit limit and parent
// they liked. So the writes happen here instead, with the service_role key that
// can never go in the browser, and this function decides what a signup is
// allowed to contain.
//
// WHAT IT GUARANTEES
//
//   · status is 'Pending' on both rows, set here, never read from the request.
//   · the parent distributor / dealer must exist and be Active.
//   · a territory, if given, must exist.
//   · credit limit, outstanding balance and role are set here, not sent.
//   · either all three records exist afterwards, or none do.
//   · a rate limit per address and an hourly ceiling overall, plus a honeypot
//     field, so the one public door into this database is not a free one.
//
// Deploy:
//   supabase functions deploy partner-signup --no-verify-jwt
//
// --no-verify-jwt matters. The caller is a member of the public with no token;
// without the flag the platform rejects the request before this code runs.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Three optional variables, all safe to leave unset:
//   SIGNUP_NOTIFY_WEBHOOK    — a URL that receives a JSON summary per signup.
//   SIGNUP_AUTOCONFIRM_EMAIL — 'true' creates accounts already confirmed.
//   SIGNUP_IP_SALT           — salt for the stored IP hashes.
//
// The rate limit needs migrations/030_signup_attempts.sql. Without that table
// the function still works and says so in the log — it is not worth refusing
// every registration because the counter is missing.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** The three things a partner can be, and everything that differs between them. */
const KINDS = {
  distributor: {
    table: 'distributors',
    role: 'Distributor',
    idPrefix: 'DIST',
    linkColumn: 'distributorId',
    creditLimit: 100000,
    parentField: null,
    parentTable: null,
    parentColumn: null,
  },
  dealer: {
    table: 'dealers',
    role: 'Dealer',
    idPrefix: 'DEAL',
    linkColumn: 'dealerId',
    creditLimit: 100000,
    parentField: 'parentDistributorId',
    parentTable: 'distributors',
    parentColumn: 'parentDistributorId',
  },
  retailer: {
    table: 'retailers',
    role: 'Retailer',
    idPrefix: 'RTL',
    linkColumn: 'retailerId',
    creditLimit: 50000,
    parentField: 'parentDealerId',
    parentTable: 'dealers',
    parentColumn: 'parentDealerId',
  },
} as const;

type Kind = keyof typeof KINDS;

const str = (v: unknown) => String(v ?? '').trim();

// ── Rate limit ───────────────────────────────────────────────────────────
//
// Deliberately loose. A real distributor registering their business does it
// once, gets something wrong, and tries again — perhaps from an office where
// several people share one address. These numbers are set to be invisible to
// that person and tiresome to anybody scripting it.
//
// Attempts and successes are counted separately on purpose. Counting only
// attempts would lock somebody out of their own registration for mistyping a
// form three times; counting only successes would leave a script free to hammer
// the account-creation path as long as each call failed.
const LIMITS = {
  attemptsPerIpPerHour: 6,
  successesPerIpPerDay: 5,
  // A flood from many addresses defeats a per-address limit. This is the
  // circuit breaker: an hour in which forty registrations arrive is not a
  // business day at Janki Herbals, it is somebody's script.
  successesPerHour: 40,
};

/**
 * Who is calling, as a salted hash.
 *
 * The address itself is never stored. Salted because IPv4 is four billion
 * values — small enough to hash exhaustively — so an unsalted digest is a
 * reversible record of who visited, wearing a disguise.
 */
async function callerHash(req: Request, salt: string): Promise<string | null> {
  // x-forwarded-for is a list; the first entry is the original client. Both
  // headers are set by the platform's edge, not by the caller, so neither can
  // be spoofed from outside — but an absent one is treated as unknown rather
  // than as a shared bucket everybody falls into.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('cf-connecting-ip')?.trim() || '';
  if (!ip) return null;

  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Same shape the browser checks with, repeated here because the browser is not a gate. */
const looksLikeEmail = (email: string) => {
  const at = email.indexOf('@');
  if (email.length < 5 || at < 1 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !/\s/.test(email);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const ipHash = await callerHash(req, Deno.env.get('SIGNUP_IP_SALT') || serviceKey);

  /**
   * Writes one row per call, and never lets its own failure stop a signup.
   *
   * If 030 has not been run the table is missing, every insert fails, and the
   * throttle counts nothing. That is the right way round: a missing counter
   * should not refuse a real distributor their registration.
   */
  // Parameters are not named `email`/`kind`: those consts exist further down,
  // and this is called both before and after they do. Shadowing them here would
  // work and read as a trap.
  const record = async (outcome: string, who: string, what: string, reason?: string) => {
    try {
      await admin.from('signup_attempts').insert([{ ip_hash: ipHash, email: who || null, kind: what || null, outcome, reason: reason ?? null }]);
    } catch (err) {
      console.error('[partner-signup] Could not record the attempt (is 030 run?):', err);
    }
  };

  // ── 1. What is being asked for ─────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Malformed request.' }, 400); }

  // The honeypot. `website` is rendered off-screen, is not focusable and has
  // no label, so nothing a person does fills it in. Automated form-fillers
  // populate every input they find.
  //
  // Answered with the ordinary success shape rather than a refusal: telling a
  // script precisely which field gave it away is how the next version of the
  // script stops filling that field. Nothing is created.
  if (str(body.website)) {
    await record('throttled', str(body.email).toLowerCase(), str(body.kind).toLowerCase(), 'honeypot');
    return json({ ok: true, partnerId: null, status: 'Pending', emailConfirmationRequired: true });
  }

  const kind = str(body.kind).toLowerCase() as Kind;
  if (!(kind in KINDS)) {
    await record('refused', str(body.email).toLowerCase(), str(body.kind).toLowerCase(), 'unknown-kind');
    return json({ error: 'Unknown registration type.' }, 400);
  }
  const spec = KINDS[kind];

  const name = str(body.name);
  const contactPerson = str(body.contactPerson);
  const email = str(body.email).toLowerCase();
  const password = String(body.password ?? '');
  const phone = str(body.phone);
  const state = str(body.state);
  const city = str(body.city);
  const gstin = str(body.gstin).toUpperCase();
  const territoryId = str(body.territoryId) || null;
  const parentId = spec.parentField ? str(body[spec.parentField]) : '';

  /**
   * Turn somebody away, and write down that it happened.
   *
   * Every refusal counts towards the per-address hourly limit, which is what
   * stops a script exploring the validation rules for free. Six an hour is
   * more than a person filling a form in wrongly will ever reach, because the
   * page checks the obvious things before it sends anything at all.
   */
  const refuse = async (message: string, status: number, reason: string) => {
    await record('refused', email, kind, reason);
    return json({ error: message }, status);
  };

  /** Turned away by the rate limit rather than by anything they typed. */
  const throttled = async (message: string, reason: string) => {
    await record('throttled', email, kind, reason);
    return json({ error: message }, 429);
  };


  // ── 1a. Has this one been asking a lot ─────────────────────────────────
  // Before the field checks, so a script posting rubbish is cheap to turn away.
  // A counting query that fails is treated as "no reason to refuse": the table
  // being absent means 030 has not been run, and that is not the visitor's
  // problem.
  const sinceHour = new Date(Date.now() - 3600_000).toISOString();
  const sinceDay = new Date(Date.now() - 86_400_000).toISOString();

  /** Rows matching a filter, or null when the count could not be taken. */
  const countAttempts = async (
    filters: { ipHash?: string; outcome?: string; since: string },
  ): Promise<number | null> => {
    try {
      let query = admin
        .from('signup_attempts')
        .select('id', { count: 'exact', head: true })
        .gte('at', filters.since);
      if (filters.ipHash) query = query.eq('ip_hash', filters.ipHash);
      if (filters.outcome) query = query.eq('outcome', filters.outcome);

      const { count, error } = await query;
      return error ? null : (count ?? 0);
    } catch {
      return null;
    }
  };

  if (ipHash) {
    const attempts = await countAttempts({ ipHash, since: sinceHour });
    const successes = await countAttempts({ ipHash, outcome: 'ok', since: sinceDay });

    if (attempts !== null && attempts >= LIMITS.attemptsPerIpPerHour) {
      return throttled('Too many registration attempts from here. Please wait an hour and try again, or contact us directly.', 'ip-hour');
    }
    if (successes !== null && successes >= LIMITS.successesPerIpPerDay) {
      return throttled('Several registrations have already been submitted from here today. Please contact us directly.', 'ip-day');
    }
  }

  const globalSuccesses = await countAttempts({ outcome: 'ok', since: sinceHour });
  if (globalSuccesses !== null && globalSuccesses >= LIMITS.successesPerHour) {
    // The circuit breaker. A per-address limit does nothing against a flood
    // from many addresses, and an hour with forty new partners in it is not a
    // business day at Janki Herbals.
    console.error(`[partner-signup] Hourly ceiling reached (${globalSuccesses}). Registrations are being refused — check signup_attempts.`);
    return throttled('Registrations are temporarily paused. Please try again later or contact us directly.', 'global-hour');
  }


  if (!name) return refuse('Business name is required.', 400, 'missing-name');
  if (!contactPerson) return refuse('Contact person is required.', 400, 'missing-contact');
  if (!phone) return refuse('Phone number is required.', 400, 'missing-phone');
  if (!state || !city) return refuse('State and city are required.', 400, 'missing-place');
  if (!looksLikeEmail(email)) return refuse('Enter a valid email address.', 400, 'bad-email');
  if (password.length < 8) return refuse('The password must be at least 8 characters.', 400, 'short-password');
  if (name.length > 200 || contactPerson.length > 200 || phone.length > 30) {
    return refuse('One of the fields is longer than it should be.', 400, 'oversized');
  }

  // ── 2. Is the email already spoken for ─────────────────────────────────
  // Asked before anything is created, so the common case fails without leaving
  // a half-made account behind. It is asked again implicitly by createUser,
  // which is the one that actually decides.
  const { data: existingProfile } = await admin
    .from('users').select('id').ilike('email', email).maybeSingle();
  if (existingProfile) {
    return refuse('An account with this email already exists. Sign in instead.', 409, 'email-taken');
  }

  // ── 3. Do the things it points at exist ────────────────────────────────
  // A foreign key would catch an id that does not exist, but not one that
  // belongs to a partner who is Pending or Inactive — and "I buy through them"
  // is a claim about somebody trading today.
  if (spec.parentField) {
    if (!parentId) return refuse(`Choose the ${spec.parentTable === 'distributors' ? 'distributor' : 'dealer'} you buy through.`, 400, 'missing-parent');
    const { data: parent, error: parentError } = await admin
      .from(spec.parentTable!).select('id, status').eq('id', parentId).maybeSingle();
    if (parentError) return refuse('Could not check who you buy through.', 500, 'parent-lookup-failed');
    if (!parent || parent.status !== 'Active') {
      return refuse('That partner is not available to register under. Pick another.', 400, 'parent-not-active');
    }
  }

  if (territoryId) {
    const { data: territory, error: territoryError } = await admin
      .from('territories').select('id').eq('id', territoryId).maybeSingle();
    if (territoryError) return refuse('Could not check the territory.', 500, 'territory-lookup-failed');
    if (!territory) return refuse('That territory does not exist.', 400, 'unknown-territory');
  }

  // ── 4. The login ───────────────────────────────────────────────────────
  // Unconfirmed by default: confirming the address is what proves the person
  // registering can read the mailbox they registered with. SIGNUP_AUTOCONFIRM_EMAIL
  // exists for the window before a real SMTP provider is configured, when no
  // confirmation mail can actually be delivered. It is not a setting to leave on.
  const autoConfirm = Deno.env.get('SIGNUP_AUTOCONFIRM_EMAIL') === 'true';
  if (autoConfirm) {
    // Said on every signup, not once at startup, so it cannot be missed in a
    // log nobody scrolled back through. This is a temporary setting and the
    // only thing that will remind anyone of that is this line.
    console.warn('[partner-signup] SIGNUP_AUTOCONFIRM_EMAIL is on: accounts are created already confirmed and nobody is proving they own the address they registered with. Turn it off once SMTP is configured.');
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: autoConfirm,
  });
  if (createError) {
    const already = /already|registered|exists/i.test(createError.message);
    return refuse(
      already ? 'An account with this email already exists. Sign in instead.' : createError.message,
      already ? 409 : 400,
      already ? 'email-taken' : 'auth-create-failed',
    );
  }
  const authUserId = created.user.id;

  // Everything after this point can fail, and a login with no partner record
  // behind it is worse than no login at all — it cannot be approved, cannot be
  // placed, and blocks the address from being used again. So each step undoes
  // what came before it.
  const undoAuth = async () => { await admin.auth.admin.deleteUser(authUserId); };

  // ── 5. The partner record ──────────────────────────────────────────────
  const now = new Date().toISOString();
  const partnerId = `${spec.idPrefix}-${Date.now()}`;

  const partnerRow: Record<string, unknown> = {
    id: partnerId,
    name,
    gstin: gstin || null,
    state,
    city,
    territoryId,
    phone,
    email,
    contactPerson,
    outstandingAmount: 0,
    creditLimit: spec.creditLimit,
    // Set here, never taken from the request. This is the whole point of the
    // function: a stranger cannot register themselves as Active.
    status: 'Pending',
    createdAt: now,
  };
  if (spec.parentColumn) partnerRow[spec.parentColumn] = parentId;

  const { error: partnerError } = await admin.from(spec.table).insert([partnerRow]);
  if (partnerError) {
    await undoAuth();
    return refuse('Could not save your registration: ' + partnerError.message, 500, 'partner-insert-failed');
  }

  const undoPartner = async () => { await admin.from(spec.table).delete().eq('id', partnerId); };

  // ── 6. The profile that gives the login a role ─────────────────────────
  const profileId = `U${Date.now()}`;
  const profile: Record<string, unknown> = {
    id: profileId,
    name: contactPerson,
    email,
    role: spec.role,
    status: 'Pending',
    managedUsers: [],
  };
  profile[spec.linkColumn] = partnerId;

  const { error: profileError } = await admin.from('users').insert([profile]);
  if (profileError) {
    await undoPartner();
    await undoAuth();
    return refuse('Could not save your registration: ' + profileError.message, 500, 'profile-insert-failed');
  }

  // ── 7. Tell somebody ───────────────────────────────────────────────────
  // Written here rather than from the browser, so a signup is on the record
  // whether or not an administrator ever opens the app. The in-app bell picks
  // Pending partners up on its own; this is what survives nobody looking.
  //
  // Neither of these may fail the signup. The registration is already saved,
  // and telling the visitor it went wrong would have them do it again.
  try {
    await admin.from('events').insert([{
      id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'partner_signup',
      message: `${spec.role} registration from ${name} (${contactPerson}, ${email}) — awaiting approval`,
      assignedTo: null,
      dataId: partnerId,
      timestamp: now,
    }]);
  } catch (err) {
    console.error('[partner-signup] Could not write the activity record:', err);
  }

  const webhook = Deno.env.get('SIGNUP_NOTIFY_WEBHOOK');
  if (webhook) {
    try {
      // Deliberately provider-agnostic. Point it at Slack, Zapier, Make, or an
      // email service's inbound hook — anything that accepts a JSON POST. `text`
      // is included because Slack-shaped receivers read that field and nothing else.
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `New ${spec.role} registration awaiting approval: ${name} (${contactPerson}, ${email}, ${city}, ${state})`,
          event: 'partner_signup',
          kind,
          partnerId,
          name,
          contactPerson,
          email,
          phone,
          city,
          state,
          at: now,
        }),
      });
    } catch (err) {
      console.error('[partner-signup] Could not reach SIGNUP_NOTIFY_WEBHOOK:', err);
    }
  }

  await record('ok', email, kind, spec.role);

  // Kept small without anything scheduled. One call in fifty does the tidying,
  // so the cost is spread and no signup waits on a delete of thirty days of
  // rows. A failure here is nothing: the next call tries again.
  if (Math.random() < 0.02) {
    try {
      await admin.from('signup_attempts')
        .delete().lt('at', new Date(Date.now() - 30 * 86_400_000).toISOString());
    } catch { /* tidying, not the job */ }
  }

  return json({
    ok: true,
    partnerId,
    userId: profileId,
    status: 'Pending',
    // So the page can say the right thing rather than guessing which it was.
    emailConfirmationRequired: !autoConfirm,
  });
});
