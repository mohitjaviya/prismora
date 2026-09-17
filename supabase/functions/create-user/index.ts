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

  // ── 3. Create the login ────────────────────────────────────────────────
  // Confirmed immediately: there is no inbox to check for a colleague whose
  // account you are setting up, and an unconfirmed account cannot sign in.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError) return json({ error: createError.message }, 400);

  // ── 4. And the profile that gives it a role ────────────────────────────
  const profile = {
    id: `U${Date.now()}`,
    name,
    email,
    role,
    managedUsers: Array.isArray(body.managedUsers) ? body.managedUsers : [],
    status: 'Active',
  };

  const { error: profileError } = await admin.from('users').insert([profile]);
  if (profileError) {
    // A login with no profile has no role and cannot be placed, so it is worse
    // than nothing. Undo it rather than leave the pair half made.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'Account created but the profile failed, so it was undone: ' + profileError.message }, 500);
  }

  return json({ ok: true, id: profile.id, email });
});
