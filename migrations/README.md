# Migrations

Every change to the database schema, numbered and in order. One file, one
change, run once.

## How to apply one

Supabase dashboard → SQL Editor → New query → paste the file → Run.

Each file is safe to run more than once (`IF NOT EXISTS`, `DROP … IF EXISTS`
before `CREATE`), and each ends by recording itself in `schema_migrations`.

## What has been applied

```sql
select filename, applied_at::date, note
from   schema_migrations
order  by filename;
```

If a file is not in that table, it has not been run.

Start with `000_baseline.sql`. It creates the table and records the 22
migrations already applied to the live database, so the answer is right from
the first query rather than after another audit.

## Why this exists

There were 25 `.sql` files in the repository root, in no order, with no record
of which had been run. Finding out took probing the live database column by
column. That audit turned up:

- `ADD_MASTER_COLOURS.sql` applied, while a commit message said it was not
- `SECURE_ROLES_TABLE.sql` written and never run, leaving a
  privilege-escalation hole open for a day
- `ADD_PRODUCT_COLUMNS.sql` missing, which meant the product catalogue could
  not be edited at all and nothing on screen said so

None of those needed to be discoveries.

## An honest warning about replaying these on a new database

**This is not a sequence you can run start to finish on an empty database and
get this schema.** Do not assume otherwise.

Files 001–008 pre-date any ordering and overlap heavily:

| File | Creates |
|---|---|
| `001_supabase_schema.sql` | 5 tables |
| `002_complete_database_schema.sql` | 31 tables, 38 columns |
| `003_phase1_schema.sql` | 7 tables, all also in 002 |
| `004_phase2_schema.sql` | 9 tables, all also in 002 |

`002` also creates four tables this database does not have —
`bank_transactions`, `notifications`, `stock_transfers`, `warehouses` — so it
describes a schema that was planned rather than the one that exists.

The real order they ran in is not recorded anywhere, and the numbering here is
a reasonable reading of dependency, not history. Nobody has tried replaying
them against a fresh database.

**If you ever need to stand up a second environment**, the reliable route is to
dump the schema from this one:

```
npx supabase db dump --schema public -f schema.sql
```

and use that as the new baseline. Then these files become what they actually
are: a record of how the current database got here.

From `009` onward each file does one thing and is safe to apply in order.

## Not migrations

`operations/` holds SQL that changes data rather than structure. It is kept
apart deliberately, so nothing sweeps it into a sequence and runs it.

- `wipe_test_data.sql` — **deletes business data.** Takes a backup first; read
  it before running it, ever.
- `seed_dealers_retailers.sql` — inserts sample partners.
- `check_territory_drop_readiness.sql` — reads only. Lists any row that would
  lose its territory, so you can see them before `027` refuses to run.

None of them record themselves in `schema_migrations`, because none is a
migration and running one twice means something quite different from running a
schema change twice.

## One that pairs with an Edge Function

`029_pending_accounts_have_no_access.sql` puts the approval gate in the
database. Until it runs, an unapproved partner who authenticates against the
REST API directly — bypassing the sign-in screen, which is where the only check
used to live — has the access of an approved one.

It pairs with `supabase/functions/partner-signup`, which is what creates those
Pending accounts in the first place. Deploy the function and run `029`; neither
is much use without the other. See `supabase/functions/README.md`.

`029` prints every status in the `users` table and every account it has just cut
off, before you rely on it. It blocks `Pending` and `Rejected` only — a
blocklist, not a whitelist, so an account with an unexpected or missing status
keeps working rather than an unknown spelling locking an administrator out.

## Two that need the application deployed first

`026`, `027` and `028` all pair with application code. `028` is the gentlest:
the RPC it creates is called with a failure treated as "carry on", so a build
that has it before the migration runs behaves exactly as it did before.

## One that has to be run in an order

`027_drop_territory_name.sql` is the only file here the running application
notices immediately. PostgREST refuses an entire statement that names a column
the table does not have, so a deployed build still writing `territory` stops
saving partners, orders, leads and beat plans the moment it runs — silently,
because local state is written before the request goes out.

**Deploy the application, then run `026`, then `027`.** Both files check what
they can: `027` refuses to run if `026` has not, and refuses if any row would
lose its territory. Neither can check which build is deployed.

## Adding a new one

1. Next number, lower-case name: `024_what_it_does.sql`
2. Say at the top what is broken without it, and how that was established
3. Make it safe to run twice
4. End with the recording block. It creates the table if it is missing, so the
   file works whether or not the baseline has been run — a migration that
   applies its change and then fails to record it is the exact state this is
   meant to prevent:

```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('024_what_it_does.sql', 'one line on what changed')
ON CONFLICT (filename) DO NOTHING;
```
