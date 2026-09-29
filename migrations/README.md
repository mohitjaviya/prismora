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

## One that records who did what, and must precede two function deploys

`040_audit_log_and_last_modified.sql` adds `audit_log` and `updatedBy` /
`updatedAt` on 30 tables, written by one trigger pair from the same
`audit_actor()` — the signed-in user, or on a service-key request the person
our server function names. The Audit Log screen reads it; `events` stays as the
Activity feed. Test it on staging with `supabase/tests/040_audit_log.sql`.

Order: run 040 **before** deploying the updated `create-user` and
`partner-signup` Edge Functions. They now send `updatedBy`, a column that does
not exist until 040 runs, and PostgREST refuses a whole insert that names an
unknown column — partner signup and user creation would fail. The app itself
works either way: the Audit Log tab says the trail is not set up yet.

## One that must precede the app, and one that can go any time

`041_grn_adds_stock_in_database.sql` moves a goods receipt's stock into the
database, in the receipt's own transaction, so a Purchase Manager (Purchases
but no Inventory) no longer saves receipts whose stock is refused. Run it
**before** deploying the app that stops writing GRN stock from the browser;
the older app with 041 in place would add the stock twice. Test:
`supabase/tests/041_grn_stock.sql`.

`042_client_write_log.sql` adds `client_write_log`, where the app records any
save that fails, takes over four seconds, or is cut off by a reload
(`src/utils/writeJournal.js`). The app tolerates it missing. Test:
`supabase/tests/042_client_write_log.sql`.

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

## Batch 1 security: run before the app that expects it

`043_batch1_access_security.sql` (Phase 1 D-02 to D-07):
- 'Inactive' is refused like Pending and Rejected.
- An account may change only its own name (a trigger on `users`); administrators change the rest, except their own status. Server functions are unaffected.
- Approving a partner activates its Pending login in the database.
- Partners can no longer update orders. They confirm receipt (`confirm_my_order_receipt`) and cancel while Pending (`cancel_my_order`). Their new orders are forced Pending, onto their own party, and priced from `products` at their tier.
- Leads and orders are scoped by owner for sales and manager roles with full Leads or SFA (`sees_account_row`).
- Invoices reach a partner only through its own orders.
- `bank_transactions` → accounting, `stock_transfers`/`warehouses` → inventory, `notifications` → own (any active staff account may send one).

`044_partner_cancel_not_after_invoice.sql`: a partner can't cancel an invoiced order, and can confirm receipt only once Shipped or Delivered.

Order: run 043 and 044 **before** deploying the matching app code. The older app writes a partner's receipt with a direct update, which 043 refuses. The newer app calls functions that don't exist until 043 runs.


`045_invoices_visible_by_own_party_id.sql` (D-06 follow-up): a partner also sees an invoice carrying its own `distributorId`/`dealerId`/`retailerId`, not only invoices on its own orders. Never by name. Applied 2026-09-28, together with linking INV-1790265113364 (order O5, raised by a sales rep, contact email of DIST-1790265786389) to that distributor. Independent of app code.

## Batch 2: deploy the app straight after this one

`046_batch2_role_fixes.sql`:
- **D-01:** Purchase Manager is restored to 010's permissions.
- **D-11:** approving a field expense books the Accounting expense in the database; only a manager or admin may decide a claim, and never their own; Accounts can read field expenses.
- **D-12:** Accounting full may record partner payments.
- **D-22:** credit notes carry a partner id.
- **Balances:** payments and credit notes move the partner's balance in the database, by id.
- **D-09 / D-10:** `sales_move_order` lets sales roles send their own Pending order to the warehouse, or cancel it.

**Deploy the matching app code right after applying 046.** The older app also moves the balance from the browser after a payment. With 046 in place, a payment recorded by that older app is counted twice.

`047_purchase_manager_no_accounting.sql`: Purchase Manager's Accounting access goes from view to none, for least access. With view, it could read every partner payment, invoice and credit note. Owner decision, 2026-09-28. Recorded in `audit_log` with that reason. Independent of app code.

## Batch 3: balances reconciled and kept honest

`048_balance_reconciliation.sql`:
- The five owner-approved balance corrections (FIX-BATCH-3-RECONCILIATION.md), each audited with its reason. Each refuses to run unless the balance is still what was reviewed.
- Deleting an invoice takes its charge back in the database.
- Direct writes to `outstandingAmount` are refused. Balances move only with invoices, payments and credit notes, or through `correct_party_balance()`.
- `partner_balance_drift()`, which the Accounting screen's "Balance check" panel shows.
- Money entries are hidden in the activity feed from roles without Accounting view.

`049_events_write_is_not_read.sql`: `events_write` was FOR ALL, and so also granted reading. It is split into insert, update and delete, so the 048 hiding holds for Sales Manager and Manager.

Both are safe with the older app code. Its browser balance writes are refused, and the database moves the balance itself.

`050_purchase_manager_no_partner_records.sql`: Purchase Manager Distributors/Dealers/Retailers full → none (least access; owner decision 2026-09-28). Audited. Independent of app code.

`051_partial_goods_receipts.sql` (D-20): every GRN against a PO is checked in the database. The PO must be open, each line must be on the PO, and receipts may not exceed what was ordered. The PO then becomes Partially Received, or GRN Done once fully received. Deploy the matching app code: the older app sets GRN Done itself after any receipt.

`052_expired_stock_never_delivered.sql` (D-18): `batch_is_sellable()` (sellable through its expiry day, India time). `deduct_stock` counts and takes sellable batches only, earliest expiry first. A refusal names the ordered, available and expired quantities. Also reopens PO-1 as Partially Received (owner request, audited). Safe with the older app, which only offers too much; the database refuses it.

`053_gst_place_of_supply.sql` (D-17): `company_settings` (seller name, GSTIN and state; demo values; readable by all, Admin edits; audited). Invoices record the seller, place of supply, supply type (intra = CGST+SGST, inter = IGST) and the split at issue, rounded once; these are fixed thereafter. `create_invoice` takes `p_party_id` / `p_place_of_supply`: a custom invoice names a partner (who is charged) or a state. Existing invoices were recorded as previously printed. Deploy the app with it: the older form sends no state, so its custom invoices are refused.

`054_sales_returns_and_no_undelivering.sql` (D-19, D-22): a delivered order cannot be cancelled, moved back or deleted by any app user; the message points to a sales return. Deliveries record their batches (`stock_movements`). `record_sales_return` / `order_returnable`: stock goes back into the batch it came from and a credit note is raised (the balance moves once). A return can never exceed what was delivered, per product or per batch. Accounting or Inventory full only.
`055_order_returnable_fix.sql`: 054's `order_returnable` could not run (ambiguous column name); fixed.
`056_sales_return_audit_label.sql`: the sales-return row is audited "via" the return, not its credit note.

`057_invoice_status_from_payments.sql`: invoice status is derived in the database (Unpaid, Partially Paid, Settled or Overdue), and so is `amountPaid`. Explicit settlements and credit notes on an invoice count first; other payments and credit notes are applied oldest first. Walk-in invoices use `markedPaid`. Statuses are recalculated on every payment, credit note or invoice change, and nightly by pg_cron (00:05 IST) so Overdue arrives on its date. Only status and amountPaid are written; balances are untouched.

### pg_cron: scheduled jobs in the database (installed by 057)

pg_cron is PostgreSQL's built-in scheduler. Supabase ships it as an extension, and 057 installed it. It runs SQL on a timetable, inside the database, whether or not anyone has the app open.

**Job:** `invoice-status-nightly`, scheduled `35 18 * * *` in UTC, which is **00:05 IST** every day. It runs `SELECT public.recompute_invoice_statuses()`. That moves an unsettled invoice to Overdue once its due date has passed, and keeps Partially Paid and Settled in step with payments. It runs as the database owner, so the audit log shows these changes as "System".

**Checking it:**
```sql
-- the job is there and active
SELECT jobid, jobname, schedule, command, active FROM cron.job;
-- the last runs, newest first: status 'succeeded' or 'failed', with any message
SELECT jobid, status, return_message, start_time, end_time
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- run it by hand, now (returns how many invoices changed)
SELECT public.recompute_invoice_statuses();
```

**Changing or stopping it:**
- `SELECT cron.unschedule('invoice-status-nightly');` stops it.
- Re-running 057's `cron.schedule(...)` block puts it back.

`058_invoice_brand_from_settings.sql`: the brand name, tagline and jurisdiction move into `company_settings` (Admin edits, audited). Each invoice records them at issue and they are fixed after that (the `invoice_gst_split` guard). Existing invoices record the text they always printed.

## Batch 4: lead attachments

`059_lead_attachments_storage.sql` (D-21): a private Storage bucket, `lead-attachments`. Each file is at most 10 MB and must be a PDF, an image, a Word file or an Excel file; Storage refuses anything else. Files live under the lead's id (`<leadId>/<timestamp>-<name>`).
- Access follows the lead (`can_view_lead` / `can_edit_lead`, built on 043's `sees_account_row`). A Sales Executive sees only their own leads' files, a Sales Manager the team's, and admin roles all of them. Leads view is enough to open a file; Leads full is needed to add or remove one.
- A lead that still has files cannot be deleted. The app removes the files first, through the Storage API; SQL cannot delete Storage objects.
- Deploy the matching app code with it. The older app never uploads, so it is unaffected, but it can no longer delete a lead that has files.

`060_highest_sequential_id.sql`: `highest_sequential_id(table, prefix)` returns the highest id number in use across the whole table. It covers leads, expenses, purchase orders, GRNs and complaints, is for signed-in users only, and returns one number and no rows.
- The app asks it when a new id clashes. Before this, a Sales Executive could not add a lead: they can see only their own leads, so every id the app tried (L1…L8) was already taken by another rep's.
- Safe with the older app, which never calls it.

## Batch 5, group 1: order rules in the database

`061_invoiced_order_locked.sql` (Phase 2 B10): once any invoice (proforma or tax) names an order, its value, quantity, product and line items are read-only for every signed-in user, Admin included.
- The refusal names the invoice and points to a sales return or credit note.
- Lines are compared by product, quantity and unit price, so the order form resending the same lines with a status change still saves.
- O113 and O118 keep the values Phase 2 gave them, as evidence.

`062_order_status_flow.sql` (Phase 2 A09): the order stages are enforced for every signed-in user.
- **One step at a time.** Pending → Processing → Ready for Dispatch → Shipped → Delivered, with Shipped → Partially Delivered → Delivered. Cancelled is allowed before delivery. No skipping, no going back, no reviving a cancelled order.
- **Each step by its owner.** Sales roles take Processing, the Warehouse Manager takes Ready for Dispatch, and the Dispatch Team takes Shipped and Delivered. Cancelling belongs to the sales roles, or to the partner for its own order. Admin may take any single step but may not skip.
- **Address and pincode.** Required from Processing on, and they can't be cleared later.
- **New orders start at Pending.** The one exception is a split's backorder, which starts at Processing.
- **Partner orders.** They now need the Processing step before the warehouse can take them: a sales role or an Admin sends them there.

Database maintenance (no signed-in user) passes both. Deploy the matching app code: the order screen offers only the next step, locks billed fields, and shows these refusals as written.

`063_invoiced_order_no_cancel_delete.sql` (owner's follow-up to 061): an order that any invoice names can't be cancelled or deleted by any signed-in user, Admin included. The refusal names the invoice and points to a credit note (or a sales return for delivered goods). Removing the invoice (Accounts) is what frees the order. Also a one-off audited maintenance correction: O113 was set back to ₹2,400 × 20 and O118 to ₹850, the values on their invoices; the Phase 2 B10 test had changed them.

## Batch 5, group 2: save reliability and vendor balances

`064_leads_numbered_by_database.sql` (Phase 2 B07): a lead inserted without an id is numbered L<highest + 1> by the database, under a lock. The app saves a new lead in one request and reads the number back. Before this, a rep's new lead took several round trips (guess, clash, ask, retry), and a page left part-way lost it without a trace. Leads inserted with an id keep it.

`065_vendor_balances_in_database.sql`: what we owe a vendor moves in the database, in the same transaction as the goods receipt (+ Σ quantity × unit cost), purchase return (− value) or vendor payment (− amount). Removing or changing one of those records moves the balance back or by the difference.
- A receipt's vendor is its PO's vendor, or, for a receipt with no PO, the vendor with exactly its name.
- App users can't write `outstandingAmount` directly.
- `vendor_balance_drift()` lists every vendor whose stored balance differs from receipts − returns − payments. It is shown in Accounting's Balance check, for Accounting or Purchases viewers.
- Existing balances were not corrected: TEST-V-1 and Janki Herbal drift and are for the owner to decide.
- Deploy with the matching app, which no longer writes vendor balances itself.
