# Edge Functions

Two, and they exist for the same reason: both need the `service_role` key, which
can create or delete any account and read past every row-level security policy.
That key can never go in the browser — the bundle is public, and anyone who
opened the site could take it and make themselves an administrator.

| Function | Who may call it | What it does |
|---|---|---|
| `create-user` | a signed-in administrator | creates a colleague's login and profile |
| `partner-signup` | anyone, no account | registers a Distributor, Dealer or Retailer as **Pending** |

## Deploying

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>

npx supabase functions deploy create-user
npx supabase functions deploy partner-signup --no-verify-jwt
```

**`--no-verify-jwt` on `partner-signup` is not optional.** The caller is a member
of the public with no token. Without the flag the platform rejects the request
before the function runs, and the signup pages report that registration is
unavailable.

`create-user` must *not* have that flag: it checks the caller's own token to
establish that they are an administrator.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are provided
by the platform. Do not add them by hand.

## Optional settings for `partner-signup`

Set under Project Settings → Edge Functions → Secrets. Both are safe to leave
unset.

| Variable | Effect when unset | Effect when set |
|---|---|---|
| `SIGNUP_NOTIFY_WEBHOOK` | the signup is recorded in `events` only | a JSON summary is POSTed per signup |
| `SIGNUP_AUTOCONFIRM_EMAIL` | the visitor must confirm their address by email | `'true'` creates accounts already confirmed |

`SIGNUP_NOTIFY_WEBHOOK` is deliberately provider-agnostic — point it at Slack,
Zapier, Make, or an email service's inbound hook. The payload carries a `text`
field as well as structured fields, because Slack-shaped receivers read `text`
and ignore everything else. A webhook that fails is logged and never fails the
signup: the registration is already saved, and telling the visitor it went wrong
would have them do it again.

`SIGNUP_AUTOCONFIRM_EMAIL` exists for the window before a real SMTP provider is
configured, when no confirmation mail can actually be delivered. Confirming the
address is what proves the person registering can read the mailbox they
registered with, so this is not a setting to leave on.

## What `partner-signup` guarantees

- `status` is `'Pending'` on both the partner row and the profile, set inside the
  function and never read from the request.
- The parent distributor or dealer must exist and be **Active**.
- A territory, if given, must exist.
- Role, credit limit and outstanding balance are decided here, not sent.
- Either all three records exist afterwards, or none of them do — each step
  undoes the ones before it.

`'Pending'` is enforced a second time by the database, in
`migrations/029_pending_accounts_have_no_access.sql`. Before that migration, the
approval gate lived only in `login()` in the browser, and anybody could
authenticate against the REST API directly and skip it.

## Known exposure

`partner-signup` is public and creates auth accounts, with no rate limit in
front of it. A determined caller could fill the partner tables with Pending
registrations. Nothing is granted by doing so — a Pending account has no access
at either layer — but it would be a mess to clear up. A real fix needs either a
count-based throttle in the function or a CAPTCHA on the form.
