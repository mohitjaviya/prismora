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

## Batch 5, group 4

`066_one_order_per_lead.sql` (Phase 2 A06): a new order naming a lead is refused while that lead already has an order that isn't Cancelled ("Lead … has already been converted to order …"). Cancelling the first order frees the lead. Existing orders are untouched.

`067_correct_vendor_balance.sql`: `correct_vendor_balance(vendor)` sets a vendor's balance to goods receipts − returns − payments. It's for Accounts full or administrators only, and is audited ("balance corrected to goods receipts − returns − payments"). It's the twin of 048's partner tool. Nothing is corrected by the migration.

`068_po_with_receipts_not_deleted.sql`: a purchase order that any goods receipt names can't be deleted by any signed-in user, Admin included. The refusal names the receipt, and the order can be closed instead. It prevents what happened to GRN-17, left without a PO when PO-10 was deleted after its receipt. Also, `correct_vendor_balance(vendor, reason)` now takes an optional reason, which is what the audit row says. The app's one-argument call still works.

`069_scheme_name_password_leak.sql`: renamed scheme SCH-1790405906612 off a name that held three demo accounts' emails and passwords in plain text (found in Phase 2 story E: any signed-in partner can read every scheme's name). Renamed to "TEST Distributor Scheme 5pct". The three affected accounts' passwords (newdistributor@gmail.com, demodealer@gmail.com, demoretailer@gmail.com) were rotated separately (not committed — auth.users update run and its temp SQL file deleted immediately after), audited against each account with the reason. New passwords are in `.env.test-accounts.local` (git-ignored) under `DEMO_*`.

`070_incentives_and_backorders_in_database.sql`: (1) F02: scheme incentives are now raised by an AFTER INSERT trigger on `orders` (`orders_earn_incentives`), in the same transaction as the order, so a partner's own order earns them (a partner may not write `distributor_incentives`, so the browser could never do it). Same rules as `utils/schemeUtils.js`; split backorders earn nothing; unique index `distributor_incentives_one_per_order_scheme`. The browser no longer creates incentives. (2) `insert_invoice_for_order`: a backorder is billed as its parent was (company, person as contact), following `splitFromOrderId` up the chain, instead of billing the person. (3) `order_one_per_lead` also runs when an order's `leadId` changes. (4) `order_backorder_open_guard`: an order cannot be cancelled or deleted while a backorder split from it is not yet Delivered or Cancelled. Existing rows untouched (O145 stays as F02 evidence; O140, the open backorder of delivered O139, is unaffected).

`071_admin_privilege_guards.sql`: Phase 2 G findings. Adds `users_guard_privilege` and `roles_guard_privilege` (only a Super Admin may give the roles Super Admin, Admin or Director, or change/delete a Super Admin account or the Super Admin role; nobody may delete their own account or the last active Super Admin; a role holding Settings cannot remove its own Settings, switch itself off or delete itself) and `users_delete_login` (deleting a profile also deletes its sign-in, so the e-mail is free again). **As applied the two guards did not work**: they were declared SECURITY DEFINER, so `current_user` was the function owner and their "is this an app user?" test let everyone through. Found by the follow-up tests, which then did real damage to TEST data and the Super Admin role row (restored from the 2026-10-02T10-42-24-127Z backup; see NOTES.md). Corrected by 072.

`072_admin_privilege_guards_fix.sql`: redefines the two guards from 071 as ordinary (invoker) functions so the rules apply. Proven by `test-results/full-test/phase2/g/guards-dryrun.mjs`, which runs 33 scenarios as the real roles inside a transaction that always rolls back: all refusals and all still-allowed edits behave as required. Known gap: a profile whose e-mail was edited no longer matches its sign-in, so deleting it leaves the original login behind.

`073_user_email_locked.sql`: a signed-in app user can no longer change a profile's e-mail (`users_email_locked`, an invoker trigger like 072; the service key and maintenance still can). A person's sign-in is matched to their profile by e-mail, so editing only the profile locked them out and left the old sign-in behind on delete. A different e-mail means a new account: create it, then deactivate or delete the old one. The Team Members edit form shows the e-mail read-only and never saves it. Proven before applying by `email-lock-dryrun.mjs` (the migration is installed inside a rolled-back transaction and 12 scenarios run as the real roles).

`074_ordered_pos_to_confirmed.sql` (Phase 2 H8, owner's OK): TEST-PO-1 and TEST-PO-PM still had the seed-data status "Ordered" (002), which no GRN accepts (051), so nothing could be received against them. Both are now "Confirmed"; the purchase_orders audit trigger recorded each change with the reason (via `app.via`). Nothing else changed: no stock, vendor balance or receipt. Proven before applying by `test-results/full-test/phase2h/po074-dryrun.mjs` (migration installed in a rolled-back transaction; the real Purchase Manager then received 5 units on TEST-PO-1, PO → Partially Received) and re-checked on the live state after applying (rolled back). TEST-PO-PM has no product lines, so goods still cannot be received on it — it can be cancelled. Backup taken before: `backups/2026-10-02T18-38-14-389Z`.

`075_money_and_stock_integrity.sql` (fix batch 9, Phase 3 HIGH findings G5/G6 + value rules): **purchase returns** are recorded and withdrawn only by `record_purchase_return` / `withdraw_purchase_return` (direct writes by a signed-in user refused by `purchase_returns_through_functions`). A line must be a whole quantity above zero, no more than this vendor's GRNs delivered less what has already gone back, and no more than is held; its unit cost may not exceed the highest this vendor charged (GRN/PO). The stock comes out in the database (vendor's batches first) and is written to `stock_movements` (new kinds `purchase_return`, `purchase_return_withdrawn`); withdrawing puts back exactly those units, and a return with no stock trail (recorded before 075) cannot be withdrawn. **Credit notes** (`credit_note_within_due`): on an invoice, at most what is still due (a sales return's note: what was billed and not yet credited), to the invoice's partner; without an invoice, at most what the partner owes; neither invoice nor partner = refused; amount/invoice/partner fixed once issued. **Issued GST tax invoices** (`invoice_issued_is_locked`): never deleted; only payment state (by the DB recalculation), `markedPaid` and `assignedTo` change; a proforma becomes a tax invoice only through Convert and cannot be deleted with a payment or credit note against it. **CHECKs**: amount > 0 on expenses, distributor/vendor payments, credit notes; ≥ 0 on invoice amount/tax, purchase return value, product prices and GST %. Guards apply to signed-in app users (e-mail claim), not maintenance. Proven before applying by `test-results/full-test/fix-batch-9/dryrun.mjs` (63 scenarios as Purchase Manager, Accounts, Admin, Super Admin, Warehouse, Distributor inside a rolled-back transaction; 50 of them fail without 075) and re-run on the live state after; screens checked by `ui.mjs`. Backup taken before: `backups/2026-10-03T08-12-36-734Z`.

`076_order_ownership_and_split_guard.sql` (fix batch 10, Phase 3 HIGH findings): **partner portal orders get an owner in the database** (`orders_set_owner`, BEFORE INSERT, after `orders_partner_order_rules`): `order_route(distributor, dealer, retailer)` walks the ordering party, then whoever it buys through (retailer -> dealer -> distributor), takes each one's territory by link or else by place (`party_territory`: state + city among a territory's districts, only if exactly one matches), and assigns the first territory's executive who is an active user; the order's `territoryId` is the first territory found. Whatever owner/territory a partner's browser sends is ignored (before 076 a partner could name any owner). **Staff orders left without an owner**: a manager- or sales-level user (Sales Manager, Sales Executive, Purchase Manager) owns it; anyone else (Admin) gets the territory route when the order names a partner, else none; an empty `territoryId` on an order naming a partner is filled in. No owner = NULL (`assignedTo` references users). **One open backorder per parent**: unique index `orders_one_open_backorder` on `splitFromOrderId` (not Cancelled/Delivered), which stops two simultaneous clicks, with trigger `order_one_open_backorder` in front naming the existing backorder. **Dealers and retailers inherit the parent's territory** when saved without one (`partners_inherit_territory`: dealer <- distributor; retailer <- dealer, else the dealer's distributor); backfill was a no-op (no row could inherit). Old ownerless orders left as they are (owner's decision). A TEST territory `T-TEST-PUNE` (Maharashtra/Pune, TEST Sales Exec 1) was added by hand on the owner's request so D-TEST-2 and its dealer/retailer route end-to-end. Proven before applying by `test-results/full-test/fix-batch-10/dryrun.mjs` (28 scenarios as Distributor, Dealer, Retailer (both TEST sets), P2E Distributor, Sales Manager, Sales Exec 1, Admin, full identity, rolled back; 21 fail without 076). Backup taken before: `backups/2026-10-03T09-02-52-745Z`.

`077_settings_tier_audit_events_complaint_delete.sql` (fix batch 11, Phase 3 G7 HIGH + audit gap + complaint delete): **Settings = full is admin tier.** `roles_guard_privilege` now also runs on INSERT, and only a Super Admin may give or take away Settings = full on any role, or delete a role that has it (an Admin could make any role an administrator). `users_guard_privilege` also refuses giving a user any role with Settings = full unless the caller is a Super Admin, whatever the role's name (`role_has_full_settings`, definer helper). create-user makes the same check. The Roles screen and the Team role list mirror it. The 071/072 rules are unchanged. **Every role's actions are logged:** `events_insert` allowed only Reports = full, so Sales Executive, partners, Dispatch, Warehouse, Purchase Manager, Customer Support and Sales got a silent 403. Any active signed-in user may now add an event. Money events still need Reports = full or Accounting view. The new `events."actorEmail"` and `timestamp` are set by `events_stamp_actor` (invoker) for app users, so an event cannot be forged in another name or back-dated, and an edit keeps both. Read, edit and delete rules are unchanged. **Complaint delete:** policy `complaints_delete` lets Super Admin and Admin delete (owner's decision). Before 077 no policy existed, so a delete removed nothing while the screen hid the row. The app now checks the deleted row count, shows the result and logs `complaint_deleted`. Proven before applying by `test-results/full-test/fix-batch-11/dryrun.mjs` (45 scenarios, full identity, rolled back; 23 fail without 077) and re-run live (45/45). Also `api.mjs` 24/24 and `ui.mjs` 5/5. Backup taken before: `backups/2026-10-03T09-47-19-345Z`.

`078_master_data_rules.sql` (fix batch 12, owner decisions + master-data rules): **Dispatch Team cannot delete orders** (`orders_delete` excludes it; Orders screen hides Delete). **Warehouse Manager records GRNs** (`grn_insert_warehouse`, INSERT only; stock/PO status/vendor balance moved by the existing definer triggers; Purchases shows it the GRN button only). **`masters` readable by every signed-in staff role** (not partners); checked first: only option labels, no prices/costs/margins/pay. **GSTIN/phone/pincode** checked by `partner_contact_checks` on distributors/dealers/retailers/vendors only when the field is entered or changed (16 old rows hold bad test values; a CHECK would also break their balance updates); GSTIN stored in capitals. CHECKs: `schemes_discount_0_100`, `schemes_dates_in_order`, `schemes_amounts_not_negative`, `products_partner_prices_within_mrp`, `<partner>_credit_limit_not_negative`. **`product_in_use_guard`**: no delete/rename while inventory, orders (product or item lines), schemes (applicableProducts/products/freeGoodsProduct) or complaints use the name. Unique `masters_list_key_ci`/`masters_list_label_ci` after merging lead_source "other" into "Other" (no lead used it). **Complaint ids from `complaints_number_seq`** (started after the highest CMP number in complaints, audit_log and events); `complaints_assign_id` numbers a blank id, and replaces an app user's CMP-<n>. Proof: `test-results/full-test/fix-batch-12/dryrun.mjs` 60/60 (38 fail without), re-run live 60/60; `ui.mjs` 16/16 local. Backup before: `backups/2026-10-03T10-31-17-867Z`.

`079_krishna_o5_credit_note_partner.sql` (Phase 4 finding P4-F1, data correction on the owner's OK): order O5, sales return SR-1790658148634 and credit note CN-SR-1790658148634 linked to Krishna pharma (DIST-1790265786389). O5 had been entered with no partner, so the ₹12,600 return credit never came off the balance. Existing triggers moved the balance from ₹15,680 to ₹3,080; invoice INV-1790265113364 is now Partially Paid with ₹3,080 due. Each step is tagged "correction 079: …" in the audit log; the block aborts unless each step changes exactly one row and the balance ends at ₹3,080. Proof before applying: `test-results/full-test/phase4/fix079-dryrun.mjs` (rolled back). O113 left as it is (owner: it already has its own settled tax invoice; delivering it adds no invoice).

`080_stock_moves_in_database.sql` (fix batch 15: P4-F5, P4-F2, Phase 3 G5 absolute stock writes): **an expired batch stays expired**: trigger `inventory_stock_guard` refuses any app user's change that turns an expired batch sellable again (expiry moved later or cleared); shortening still allowed; maintenance can correct. **Adjust, Cycle Count and Transfer are DB operations** (definer, Inventory full, not partners), one transaction each, writing `stock_movements` with new columns `note` and `createdBy`: `adjust_stock(batch, change, reason)` (kind `adjustment`, signed; refuses below 0 instead of clamping, reason required), `count_stock(batch, counted, expected)` (kind `cycle_count`, signed variance; refuses if the batch moved since the count was opened), `transfer_stock(batch, warehouse, qty, notes)` (`transfer_out` + `transfer_in`; destination must be a warehouse; merges into the same product+batch there, else a new batch with the same expiry). Kind CHECK extended. **Quantities move only in the database** (owner's decision): `inventory_stock_guard` refuses a direct quantity change by an app user (current_user authenticated/anon); deliveries, GRNs, sales and purchase returns run with owner rights and are unaffected; Add Batch still sets the opening quantity; the Edit form shows quantity read-only and no longer sends it. **`masters` and `warehouses` audited** (`audit_row`). Proof: `test-results/full-test/fix-batch-15/dryrun.mjs` 41/41 with 080 (32 fail without), rolled back. Backup before: `backups/2026-10-03T17-14-46-451Z`.

`081_batch_move_and_grn_movements.sql` (the two gaps left by batch 15, owner 2026-10-03): **a batch holding stock changes warehouse only through `transfer_stock`**: `inventory_stock_guard` also refuses an app user's direct warehouse change when the batch holds units (an empty batch can still be relabelled); `transfer_stock` now moves the batch itself when all of it goes and the destination has no matching batch (no empty row left behind), else merges or splits as before; transfer_out + transfer_in either way. The batch Edit form saves the other fields, then calls Transfer for the full quantity. **GRNs write a movement row**: `grn_adds_stock` records kind `grn` per received line with new column `grnId`, the person (`createdBy`) and a note naming the GRN and PO; resets `app.via` at the end. Kind CHECK extended. GRNs from before 081 not backfilled. Proof: `test-results/full-test/fix-batch-15b/dryrun.mjs` 15/15 with 081 (7 fail without), rolled back. Backup before: `backups/2026-10-03T17-45-16-453Z`.

`082_grn_delete_reverses_stock.sql` (owner 2026-10-03, GRN-delete stock gap): **deleting a GRN takes its stock back out**: `grn_delete_reverses_stock` (BEFORE DELETE, definer) removes exactly the units the GRN added from the batches its 081 `grn` movement rows name, writing kind `grn_reversed`; **refused** if any of those batches no longer holds them (delivered/moved/adjusted since; use a purchase return) or, for an app user, if the GRN predates 081 (no movement rows; maintenance may still remove such a row with no stock change). `grn_delete_po_status` (AFTER DELETE) works the PO status out again from the remaining receipts (Confirmed / Partially Received / GRN Done); Closed/Cancelled left alone. Vendor balance still reversed by `vendor_balance_from_grn`. No screen deletes GRNs (Purchases-full roles via API). Proof: `test-results/full-test/fix-batch-15c/dryrun.mjs` 9/9 with 082 (8 fail without), live 9/9; `ui.mjs` 9/9: a real GRN-23 recorded in the browser by TEST Warehouse, movement row confirmed, deleted by TEST Purchase Manager, everything back to the start. Backup before: `backups/2026-10-03T18-09-53-177Z`.

`083_partner_flow.sql` (fix batch 16, owner decisions 2026-10-04): **incentives paid in the DB** by `pay_incentive(id)` (Incentives full, not partners) through `pay_incentive_internal`: a cash/discount incentive books expense `EXP-<incentive id>` (the id the app already used), free goods leave sellable stock earliest-expiry first with `stock_movements` kind `free_goods` (new column `incentiveId`), then Paid; short of sellable stock = refused, stays Earned (carry-over finding 2: Accounts, with no Inventory access, used to leave free goods in stock). `incentives_written_by_db` (invoker) refuses app users inserting incentives or changing status/value/type/product/party directly. **Claims tied to incentives**: `scheme_claims."incentiveId"` (FK) + unique open claim per incentive; `claims_tied_to_incentive` requires an Earned incentive of the same partner, takes scheme/order/partner from it, amount ≤ value (0 for free goods), status Pending; `claims_settle_pays_incentive` pays the incentive on Settled for the claimed amount (expense category Scheme Claim), a Settled claim is final, incentive/amount/partner fixed; old claims without an incentive cannot be settled. `pay_incentive` refuses while a claim is open. **Partner complaints unassigned** (`complaints_partner_unassigned`). **Partners read only Active schemes for their type or All** (`schemes_select`). Sign-up address + pincode: `partner-signup` Edge Function v6 (no-verify-jwt as before) + the 3 sign-up pages. Proof: `test-results/full-test/fix-batch-16/dryrun.mjs` 26/26 with 083 (24 fail without), live 26/26. Backup before: `backups/2026-10-04T02-58-33-335Z`.

`084_grn_edit_and_expense_date.sql` (fix batch 17, owner 2026-10-04): **a GRN's items, PO and vendor can't be edited by app users** (`grn_lines_locked`, invoker, BEFORE UPDATE). Editing them (API only) moved the vendor balance but not stock or movement rows. A wrong receipt is deleted (082 takes its stock back out) and recorded again. Notes and received date can still be edited, and maintenance is unaffected. **An expense can't be dated after today, India time** (`expense_not_future`, invoker; on insert or a date change only, so old rows stay editable; payout expenses from owner-rights functions are unaffected). Refusals use P0001, so the screen shows them as written. Proof: `test-results/full-test/fix-batch-17/dryrun.mjs` 13/13 with 084 (6 fail without), rolled back. Backup: skipped on the owner's instruction.

`085_system_heartbeat.sql` (Gap 13, keep-alive; prepared 2026-10-04, **not applied yet**): one-row table `system_heartbeat` (`id` = 1 only, `last_ping_at`, `source` ≤ 64 chars). RLS is on with no policies, and anon/authenticated have no table rights. Two definer functions are executable by anon only: `heartbeat_ping(p_source)` stamps row 1 and returns it, and `heartbeat_status()` reads it. They are called every 2 days by `.github/workflows/supabase-keepalive.yml` so the free-tier project doesn't pause (the in-database cron of 057 doesn't count as activity). No business table, data or existing job is touched. See README.md "Supabase keep-alive".

`086_sales_return_condition.sql` (Gap 11 G, owner 2026-10-04; prepared, **not applied yet**): each returned line carries a condition, Good / Damaged / Expired. Good goes back into the batch's `quantity` (sellable) as before; Damaged and Expired go into the batch's existing `damaged` counter instead (sellable = quantity − reserved, so never sold or delivered; Expired shares the counter by the owner's choice, the per-line condition tells them apart). New nullable columns `sales_returns.condition` (Good/Damaged/Expired/Mixed) and `stock_movements.condition`; the line JSON gets `condition`. A line sent without a condition is taken as Good, so the screen as it was before 086 keeps working; any other value is refused. Credit note unchanged. The 14 earlier returns keep condition NULL ("Not recorded"): no stock, credit note, balance or ledger value changes. `record_sales_return` is otherwise the live 054/056 definition. Proof: `test-results/full-test/gap11/dryrun.mjs` 8/8 with 086 (6 fail without), as TEST Accounts / Sales Exec 1 with full identity, rolled back; live DB checked unchanged afterwards. Apply: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/086_sales_return_condition.sql`. Not included (owner, follow-up): moving damaged units back to sellable.

`087_damaged_stock_locked.sql` (Gap 16, owner 2026-10-04; prepared, **not applied yet**): a batch's `damaged` count changes only through `write_off_damaged(batch, qty, reason)` (kind `damaged_write_off`) and `return_damaged_to_vendor(batch, vendor, qty, unit cost, reason)` (kind `damaged_to_vendor` + a purchase_returns row "Damaged goods" that credits the vendor through the existing trigger; 075 rules: vendor must have supplied the product, no more back than received, unit cost no higher than charged). Both Super Admin / Admin / Warehouse Manager only (`may_move_damaged_stock`, by role name), reason required (3+ characters), whole quantity ≤ damaged, person on the movement row. `inventory_damaged_locked` (invoker): app users cannot change `damaged` directly or delete a batch that still holds damaged units. `withdraw_purchase_return` = live 075 definition + refuses a damaged-goods return (would put damaged goods on sale). **Opening balances:** one `opening` row per existing batch (its quantity) and `opening_damaged` where damaged > 0, written once; afterwards the deferred constraint trigger `inventory_opening_balance` writes them for a batch typed in on Add Batch when its transaction commits, unless a movement already explains it (GRN / transfer / return). Rows record current values; nothing else changes. `stock_damaged_locked()` tells the screen 087 is in place. Proof: `test-results/full-test/gap16/dryrun.mjs` 18/18 with 087 (17 fail without), real roles with full identity, rolled back. Apply after 086: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/087_damaged_stock_locked.sql`. Not included (owner, follow-up): moving damaged units back to sellable.

`089_correct_return_condition.sql` (owner 2026-10-04, after O319/O320; prepared, **not applied yet**; 088 is reserved for Gap 5): **needs 086 and 087 first** (refuses to install otherwise). `correct_return_condition(return, product, batch, qty, Damaged|Expired, reason)` moves units of an earlier return line that went back on sale (condition NULL before 086, or Good) from the batch's quantity to its damaged count: Super Admin / Admin / Warehouse Manager (087's `may_move_damaged_stock`), reason required, no more than the line's quantity less earlier corrections, refused unless quantity − reserved still covers it (sold/reserved/moved since = refused). Movement kind `return_reclassified` (stock −q, damaged +q) with return, order, person, reason; the line gets `corrections: [{quantity, condition, reason, at, by}]`. Credit note, invoice, partner balance and ledger untouched. `stock_return_correction_enabled()` for the screen. Proof: `test-results/full-test/fix-o320/dryrun.mjs` 12/12 with 086+087+089 on the real O319/O320 returns (12 fail without), real roles, rolled back. Apply order: 086, 087, 089.

`090_batch_number_required.sql` (Gap 18, owner 2026-10-04; prepared, **not applied yet**; independent of 085–089): new and edited batches only. Trigger `inventory_batch_number_rules` (invoker): an app user can't add a batch without a number or clear one; a number is used once per product (any warehouse, trimmed, case ignored) — checked on an app Add Batch and on any change of number/product, so the 3 old Aloevera "abc123" batches and the 4 without a number stay as they are until edited; `transfer_stock`'s copy in the other warehouse is the same batch and allowed. Trigger `grn_lines_need_batch`: every goods-receipt line receiving units needs a number. Screens mirror it (`utils/batchNumber.js`, Inventory Add/Edit, Purchases GRN). Proof: `test-results/full-test/gap18/dryrun.mjs` 14/14 with 090, 8 fail without, real roles, rolled back. Apply: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/090_batch_number_required.sql`.

`091_expired_stock_moves.sql` (Gap 17, owner 2026-10-04; prepared, **not applied yet**): **needs 087** (refuses to install otherwise). Apply order 086 → 087 → 089 → 091. `write_off_expired(batch, qty, reason)` (kind `expired_write_off`) and `return_expired_to_vendor(batch, vendor, qty, unit cost, reason)` (kind `expired_to_vendor` + purchase return reason "Expired stock", vendor credited by the existing trigger): Super Admin / Admin / Warehouse Manager (087's `may_move_damaged_stock`), reason required, only on a batch whose expiry date (IST) is before today, no more than quantity − reserved, from that batch only (075's `record_purchase_return` takes stock by product). Vendor return follows 075's rules and cannot be withdrawn (`withdraw_purchase_return` = 087's + check). `stock_expired_moves_enabled()` for the screen. Proof: `test-results/full-test/gap17/dryrun.mjs` 13/13 with 087+091, 12 fail with 087 only, real roles, rolled back. Apply: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/091_expired_stock_moves.sql`.

`092_record_partner_payment.sql` (Gap 7 A, owner 2026-10-04; prepared, **not applied yet**; independent of 085–091): **one way to record a partner's payment.** `record_partner_payment(party type, party id, amount, method, reference, date, notes, invoice)` (invoker) is the only insert behind both partner "Record Payment" (Distributors/Dealers/Retailers) and Accounting "Mark as Paid". Permission = the 046 policy, asked first for a clear refusal (Ledger or Accounting full, not a partner). `recordedBy` = the caller (`my_user_id()`), never sent by the browser (Mark as Paid used to leave it NULL). With an invoice: must be this partner's, must still have money due; amount = total − `amountPaid` in the database (not the screen's figure); id `PAY-INV-<invoice>` (057's tie; "Mark unpaid" still deletes it), method default "Invoice settled", reference default the invoice id; a second settle is refused. Without: amount > 0, id `PAY-<epoch ms>`, spread oldest first by 057. One partner's payments one at a time (advisory lock). Balance (046) and statuses (057) move through the existing triggers, unchanged. `partner_payment_function_enabled()` for the screen; before 092 the screen inserts the same row itself. Proof: `test-results/full-test/gap7/dryrun.mjs` 11/11 with 092 (11 fail without), D-TEST-2 as TEST Accounts / Admin / Sales Exec 1 / Distributor 2, full identity, rolled back. Apply: `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/092_record_partner_payment.sql`.
