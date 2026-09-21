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

All three are safe to leave unset.

| Variable | Effect when unset | Effect when set |
|---|---|---|
| `SIGNUP_NOTIFY_WEBHOOK` | the signup is recorded in `events` only | a JSON summary is POSTed per signup |
| `SIGNUP_AUTOCONFIRM_EMAIL` | the visitor must confirm their address by email | `'true'` creates accounts already confirmed |
| `SIGNUP_IP_SALT` | the service key salts the stored IP hashes | that value salts them instead |

Set them with the CLI:

```bash
npx supabase secrets set SIGNUP_AUTOCONFIRM_EMAIL=true
npx supabase secrets list
```

or in the dashboard under **Project Settings → Edge Functions → Secrets**. A
secret takes effect on the next invocation; the function does not need
redeploying.

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

## Rate limit and spam protection

Needs `migrations/030_signup_attempts.sql`, which creates the table the counting
happens in. **Without it the function still works** — every count fails, the
throttle finds no reason to refuse anybody, and a line goes in the log. A
missing counter should not cost a real distributor their registration.

| Limit | Value | Counts |
|---|---|---|
| Attempts per address per hour | 6 | every call, including refusals |
| Successful registrations per address per day | 5 | successes only |
| Successful registrations per hour, all addresses | 40 | the circuit breaker |

Attempts and successes are counted separately on purpose. Counting only attempts
would lock somebody out of their own registration for mistyping a form three
times; counting only successes would leave a script free to hammer the
account-creation path as long as each call failed.

The numbers are deliberately loose — set to be invisible to a real partner
registering their business from an office where several people share one address,
and tiresome to anybody scripting it. They are the `LIMITS` object at the top of
`index.ts`.

**The honeypot.** The forms carry a `website` field, rendered off-screen with no
label and no tab stop. Nothing a person does fills it in; automated form-fillers
populate every input they find. A filled one is answered with the ordinary
success shape and nothing is created — telling a script which field gave it away
is how the next version of the script stops filling that field.

**Addresses are not stored.** `signup_attempts.ip_hash` is a salted SHA-256.
Two requests from one address produce the same hash, which is all a throttle
needs; the address cannot be read back out. The salt matters — IPv4 is four
billion values, small enough to hash exhaustively, so an unsalted digest would
be a reversible record of who visited.

Nobody can read that table through the API: RLS is on and there are no policies.
The function reaches it with the service key; a person reads it in the SQL
editor. Queries worth having are in the migration's comments.

## Known exposure

The throttle is per address and per hour. A distributed flood from many
addresses gets through the first two limits and is caught only by the hourly
ceiling, which refuses everybody — real registrations included — until the hour
passes. If that becomes a real problem rather than a theoretical one, the next
step is a CAPTCHA on the form, not a smaller number here.
