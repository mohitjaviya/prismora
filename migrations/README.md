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

## Two that can run before or after their deploy

`031_created_by.sql` and `032_created_by_part_two.sql` add `createdBy` to
`expenses`, `purchase_orders`, `orders`, `invoices` and `leads`. The application
writes that column, but names it as optional on the insert — so a build that
reaches production before the migration drops the field and keeps the record,
rather than PostgREST refusing the whole statement. Run them whenever; nothing
breaks in either order, and until they run the screens say "Not recorded".

The other five tables that record an author — `grn`, `purchase_returns`,
`vendor_payments`, `credit_notes`, `distributor_payments` — already had the
column under a different name and needed no migration at all. They needed
somebody to read it.

## One the signup pages want before they read properly

`033_public_territories_districts.sql` adds `districts` to the `public_territories`
view, so the signup forms can work out a partner's territory from the state and
city they already give rather than asking them to pick an internal zone name.
Until it runs, the derived line on those pages says the area is not covered yet
— the Edge Function derives it server-side either way, so nothing is lost, it
just is not shown.

## One that sales needs before it can take an order

`034_sales_raise_own_orders.sql` lets the sales roles raise an order at
Pending — their own, or anyone's for a manager. Until it runs, "Order placed" on
a field visit and converting a lead are refused for everyone but Admin, and the
app now says so instead of carrying on with an order that was never saved.

## One that keeps each rep to their own field records

`035_sfa_own_rows.sql` (after 034) limits `visit_reports`, `attendance`,
`beat_plans` and `sfa_expenses` to the rows a user may see — their own, their
team's for a manager, everyone's for an admin — for reading and writing both.
Until it runs, any rep can read, change or delete any other rep's field
records; the SFA screen hides them, but the API does not.

## One that lets the sales side see the catalogue

`036_products_readable_by_sales.sql` lets anyone with leads, SFA or orders
access read `products`. Until it runs, Sales, Sales Executive, Accounts and
Customer Support read an empty catalogue: no products on a lead, a field
visit, an order or a complaint, and invoices fall back to default GST and HSN.

## One that holds a beat to its date

`037_early_checkin_requests.sql` (after 034 and 035) adds
`beat_checkin_requests` and the check-in window: a beat is worked on its date;
earlier needs a request approved the same day by an admin or the rep's manager;
after it the beat is Missed and read-only. "Today" is India's date
(`app_today()`). Until it runs, the SFA screen's request button fails and
nothing stops a visit being logged against any date.

## One that holds every role to its own settings

`038_access_follows_role_settings.sql` (after 037) makes `app_access()` return
each role's configured access, with Super Admin the one unrestricted role, and
makes `is_app_admin()` mean Settings = full. Until it runs, every admin-level
role — Director included — has full access to every module and can manage users
and roles, whatever its settings say. Admin is configured full everywhere and
is unaffected.

## One that must go live with its app code — not before

`039_delivery_invoicing_in_database.sql` (after 038) moves delivery into the
database: marking an order Delivered takes the stock, raises a proforma
invoice (no GST, each line's catalogue rate stored) and charges the partner in
one transaction, whoever clicks — Dispatch included. It adds
`convert_to_tax_invoice()` and `create_invoice()` for Accounts, one invoice per
order, and order ids from a sequence.

Run it in the same release as the app code that expects it. The older app
inserts orders with its own id, bills and deducts stock from the browser, and
does not check whether a delivery was refused; the newer app inserts orders
without an id and calls the two functions, which do not exist until this runs.

## One that pairs with an Edge Function

`029_pending_accounts_have_no_access.sql` puts the approval gate in the
database. Until it runs, an unapproved partner who authenticates against the
REST API directly — bypassing the sign-in screen, which is where the only check
used to live — has the access of an approved one.

It pairs with `supabase/functions/partner-signup`, which is what creates those
Pending accounts in the first place. Deploy the function and run `029` and
`030`; none of the three is much use without the others. See
`supabase/functions/README.md`.

`030_signup_attempts.sql` gives that function somewhere to count from, for its
rate limit. Without it the function still works — the counts fail, the throttle
finds no reason to refuse anybody, and a line goes in the log. That table has
RLS on and deliberately **no policies**, so nothing reaches it through the API.

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
