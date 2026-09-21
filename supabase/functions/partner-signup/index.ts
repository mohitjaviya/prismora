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
//
// Deploy:
//   supabase functions deploy partner-signup --no-verify-jwt
//
// --no-verify-jwt matters. The caller is a member of the public with no token;
// without the flag the platform rejects the request before this code runs.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Two optional variables, both safe to leave unset:
//   SIGNUP_NOTIFY_WEBHOOK    — a URL that receives a JSON summary per signup.
//   SIGNUP_AUTOCONFIRM_EMAIL — 'true' creates accounts already confirmed.

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

  // ── 1. What is being asked for ─────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Malformed request.' }, 400); }

  const kind = str(body.kind).toLowerCase() as Kind;
  if (!(kind in KINDS)) return json({ error: 'Unknown registration type.' }, 400);
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

  if (!name) return json({ error: 'Business name is required.' }, 400);
  if (!contactPerson) return json({ error: 'Contact person is required.' }, 400);
  if (!phone) return json({ error: 'Phone number is required.' }, 400);
  if (!state || !city) return json({ error: 'State and city are required.' }, 400);
  if (!looksLikeEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400);
  if (name.length > 200 || contactPerson.length > 200 || phone.length > 30) {
    return json({ error: 'One of the fields is longer than it should be.' }, 400);
  }

  // ── 2. Is the email already spoken for ─────────────────────────────────
  // Asked before anything is created, so the common case fails without leaving
  // a half-made account behind. It is asked again implicitly by createUser,
  // which is the one that actually decides.
  const { data: existingProfile } = await admin
    .from('users').select('id').ilike('email', email).maybeSingle();
  if (existingProfile) {
    return json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
  }

  // ── 3. Do the things it points at exist ────────────────────────────────
  // A foreign key would catch an id that does not exist, but not one that
  // belongs to a partner who is Pending or Inactive — and "I buy through them"
  // is a claim about somebody trading today.
  if (spec.parentField) {
    if (!parentId) return json({ error: `Choose the ${spec.parentTable === 'distributors' ? 'distributor' : 'dealer'} you buy through.` }, 400);
    const { data: parent, error: parentError } = await admin
      .from(spec.parentTable!).select('id, status').eq('id', parentId).maybeSingle();
    if (parentError) return json({ error: 'Could not check who you buy through.' }, 500);
    if (!parent || parent.status !== 'Active') {
      return json({ error: 'That partner is not available to register under. Pick another.' }, 400);
    }
  }

  if (territoryId) {
    const { data: territory, error: territoryError } = await admin
      .from('territories').select('id').eq('id', territoryId).maybeSingle();
    if (territoryError) return json({ error: 'Could not check the territory.' }, 500);
    if (!territory) return json({ error: 'That territory does not exist.' }, 400);
  }

  // ── 4. The login ───────────────────────────────────────────────────────
  // Unconfirmed by default: confirming the address is what proves the person
  // registering can read the mailbox they registered with. SIGNUP_AUTOCONFIRM_EMAIL
  // exists for the window before a real SMTP provider is configured, when no
  // confirmation mail can actually be delivered. It is not a setting to leave on.
  const autoConfirm = Deno.env.get('SIGNUP_AUTOCONFIRM_EMAIL') === 'true';

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: autoConfirm,
  });
  if (createError) {
    const already = /already|registered|exists/i.test(createError.message);
    return json(
      { error: already ? 'An account with this email already exists. Sign in instead.' : createError.message },
      already ? 409 : 400,
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
    return json({ error: 'Could not save your registration: ' + partnerError.message }, 500);
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
    return json({ error: 'Could not save your registration: ' + profileError.message }, 500);
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

  return json({
    ok: true,
    partnerId,
    userId: profileId,
    status: 'Pending',
    // So the page can say the right thing rather than guessing which it was.
    emailConfirmationRequired: !autoConfirm,
  });
});
