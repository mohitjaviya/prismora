// PRISMORA — create a sign-in account on behalf of an administrator.
//
// Creating a login needs the service_role key, which can create or delete any
// account and read past every row-level security policy. It can never go in the
// browser: the bundle is public, and anyone who opened the site could take the
// key and make themselves an administrator. That is exactly the hole this
// project has just closed.
//
// So it lives here instead. The browser sends the signed-in administrator's own
// token; this function checks that the caller really is an administrator, and
// only then uses the service key to create the account.
//
// Deploy:
//   supabase functions deploy create-user
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY variables are provided by the
// platform — do not add them by hand.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_ROLES = ['Super Admin', 'Director', 'Admin'];

// A partner role is only meaningful with a record behind it. Every portal
// screen finds its partner with distributors.find(d => d.id === user.distributorId),
// and my_distributor_id() does the same in the row-level policies -- so a
// 'Distributor' profile with no distributorId is an account that signs in to an
// empty screen and can read nothing. Settings could make exactly that before
// this function accepted the link.
const PARTNER_ROLES: Record<string, { column: string; table: string }> = {
  Distributor: { column: 'distributorId', table: 'distributors' },
  Dealer: { column: 'dealerId', table: 'dealers' },
  Retailer: { column: 'retailerId', table: 'retailers' },
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ── 1. Who is asking? ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in.' }, 401);

  // Deliberately the anon key with the caller's token, so this read is subject
  // to the same rules as the caller — it establishes who they are, nothing more.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth, error: authError } = await asCaller.auth.getUser();
  if (authError || !auth?.user?.email) return json({ error: 'Not signed in.' }, 401);

  const admin = createClient(url, serviceKey);

  const { data: caller, error: callerError } = await admin
    .from('users').select('role').ilike('email', auth.user.email).maybeSingle();

  if (callerError) return json({ error: 'Could not verify your account.' }, 500);
  if (!caller || !ADMIN_ROLES.includes(caller.role)) {
    // Checked here rather than trusted from the request. A role sent by the
    // browser is a claim; this is the stored fact.
    return json({ error: 'Only an administrator can create an account.' }, 403);
  }

  // ── 2. What are they asking for? ───────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Malformed request.' }, 400); }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  const role = String(body.role ?? '').trim();

  if (!email || !password || !name || !role) {
    return json({ error: 'Name, email, password and role are all required.' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'The password must be at least 8 characters.' }, 400);
  }
  if (ADMIN_ROLES.includes(role) && caller.role !== 'Super Admin') {
    // Only the top of the tree may create another account at the top.
    return json({ error: 'Only a Super Admin can create an administrator.' }, 403);
  }

  // ── 2a. A partner role needs the record it belongs to ──────────────────
  const partner = PARTNER_ROLES[role];
  const linkId = partner ? String(body[partner.column] ?? '').trim() : '';

  if (partner) {
    if (!linkId) {
      return json({ error: `A ${role} account has to be attached to a ${role.toLowerCase()} record. Create it from that record's own screen.` }, 400);
    }

    const { data: record, error: recordError } = await admin
      .from(partner.table).select('id, status').eq('id', linkId).maybeSingle();

    if (recordError) return json({ error: `Could not check the ${role.toLowerCase()} record.` }, 500);
    if (!record) return json({ error: `That ${role.toLowerCase()} record does not exist.` }, 400);
    if (record.status !== 'Active') {
      // 029 blocks a Pending or Rejected account from reading anything, so the
      // login would exist and not work. Refused here rather than handed over
      // as a password that fails.
      return json({ error: `That ${role.toLowerCase()} is ${String(record.status).toLowerCase()}. Approve it first, then create the login.` }, 400);
    }

    // One partner, one login. A second would mean two accounts able to place
    // orders as the same business with no way to tell them apart afterwards.
    const { data: taken } = await admin
      .from('users').select('id, email').eq(partner.column, linkId).maybeSingle();
    if (taken) {
      return json({ error: `${taken.email} can already sign in for that ${role.toLowerCase()}.` }, 409);
    }
  } else if (Object.values(PARTNER_ROLES).some(p => body[p.column])) {
    // A staff role arriving with a partner link is a mistake somewhere, and
    // storing it would scope their access to that partner's rows.
    return json({ error: 'A staff account cannot be attached to a partner record.' }, 400);
  }

  // ── 3. Create the login ────────────────────────────────────────────────
  // Confirmed immediately: there is no inbox to check for a colleague whose
  // account you are setting up, and an unconfirmed account cannot sign in.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError) return json({ error: createError.message }, 400);

  // ── 4. And the profile that gives it a role ────────────────────────────
  const profile: Record<string, unknown> = {
    id: `U${Date.now()}`,
    name,
    email,
    role,
    managedUsers: Array.isArray(body.managedUsers) ? body.managedUsers : [],
    // Set here, never read from the request. An administrator creating an
    // account is the approval, so it is Active — unlike the public signup,
    // where nobody has vouched for anybody.
    status: 'Active',
  };
  // The link. Without it a partner signs in to an empty portal, which is what
  // this whole function change is for.
  if (partner) profile[partner.column] = linkId;

  const { error: profileError } = await admin.from('users').insert([profile]);
  if (profileError) {
    // A login with no profile has no role and cannot be placed, so it is worse
    // than nothing. Undo it rather than leave the pair half made.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'Account created but the profile failed, so it was undone: ' + profileError.message }, 500);
  }

  return json({ ok: true, id: profile.id, email, linkedTo: partner ? linkId : null });
});
