# Phase 4 working notes (raw; the report is PHASE4-REPORT.md)

Backup before Phase 4: `backups/2026-10-03T16-09-11-712Z`. Helper: `node q.mjs file.sql | -e "SQL"` (read-only).

## INT-01 stock — PASS since audit began; history listed
- int01-batches.sql/.out: 29 live batches rebuilt from audit_log (opening + GRN + delivery + sales return + purchase return/withdrawn + app + other). 0 unaudited writes (chain gaps), 0 end mismatches. 4 deleted rows (Phase 3 G5 Warehouse test rows, net 0).
- int01-sources.sql/.out: 55 documents match their stock move exactly (18 GRNs since 09-27, 14 sales returns, deliveries since 09-28 13:12 incl. stock_movements log).
- History (not new bugs), listed with values:
  - Before audit (2026-09-25 13:52): GRN-1, GRN-2 (janki herbals, no PO, 100 + 100 Aloevera BTC2026) -> batch BTC2026 now 0, no audit rows at all; O5 delivered 100 Aloevera 09-24 (batch unknown) -> up to 100 units of BTC2026 unexplained. GRN-3 (100 abc123) = opening 100 of INV-ITEM-1790056118706-tnhw; GRN-4 (100 btc2027) = opening 100 of -8yw6; GRN-5 (200 cfghbjnmk) = opening 200 of -wukv. Btc2020 Tulsi (INV-ITEM-1790188733140) created by hand 09-23 18:38 with no GRN, O1 delivered 100 Tulsi 41 s later; now 0, no audit rows. INV-ITEM-1790056463204 (abc123) created 09-22 by hand, opening 0.
  - Seeded test docs that never moved stock: TEST-GRN-1 (100 TEST Herbal Shampoo, batch TEST-B5 — no such batch exists), TEST-RET-1 (4 Shampoo, ₹360), TEST-GRN-PM / TEST-RET-PM (no items).
  - Before GRN trigger (09-26): GRN-6 (+50), GRN-7 (+70) added by the browser (Admin) to INV-ITEM-1790056463204; GRN-8 (+100) to INV-ITEM-1790410779080 (browser, which had a hand-made opening of 100 two minutes earlier). Accounted for, but by app writes.
  - Pre-075 purchase return PR-1790664107704 (5 Neem, TEST P2 vendor): stock taken out by the browser (−5 on TEST-P2-GRN-N2, 09-29 06:41). Accounted for.
  - Deliveries before the stock_movements log (09-28 13:12): O8, O9, O10, O11, O15, O23, O24, O26, O30, O38, O79, O81, O83, O85, O87, O89, O100 — stock moved and audited, just no movement row. O1, O5 before audit.
- Still open (known, not new): adjust / cycle count / transfer / batch add are browser writes of absolute quantities with no stock_movements row (audit_log has them, via empty).

## INT-02 partner balances — PASS for every partner (25/25 diff 0.00), 1 FINDING
- int02-partners.sql: stored = invoices (amount+tax, tax + proforma) − payments − credit notes; my rebuild = DB helper = stored for all 25 partners.
- int02-02/06-drift.mjs (rolerun): partner_balance_drift() and vendor_balance_drift() = 0 rows as Accounts, Admin, Super Admin, Purchase Manager; control: ₹1 planted (rolled back) is seen by Accounts (difference 1.00), not by the SQL role (known gotcha).
- int02-status.sql: recompute_invoice_statuses for every partner + every partner-less invoice (rolled back) -> 0 changes: all stored status/amountPaid current.
- int02-orphans.sql: 19 partner-less invoices + 2 partner-less CNs are walk-ins (by design).
- **FINDING P4-F1 (MEDIUM, data + gap): Krishna pharma (DIST-1790265786389) balance ₹15,680 should be ₹3,080.** Order O5 has no partner; the 09-28 reconciliation linked only its invoice INV-1790265113364 (₹14,000 + ₹1,680) by hand. Sales return SR-1790658148634 (09-29, Admin, ₹12,600 "Damaged in transit") took the partner from the ORDER, so CN-SR-1790658148634 has no partner: never came off the balance; invoice still "Unpaid", ₹15,680 due. Drift check is blind to it (same attribution). Only invoice whose partner differs from its order's; only CN whose partner differs from its invoice's. Inflates Total Outstanding by ₹12,600.

## INT-06 vendor balances — PASS (4/4 diff 0.00)
- int06-vendors.sql: TEST-V-1 ₹4,839; Janki ₹1,53,500; TEST P2 Vendor ₹1,021; TEST-P3 Vendor ₹400. Returns/payments all point at a vendor.
- History: GRN-1, GRN-2 ("janki herbals", no PO, ₹16,500) match no vendor (owner decision: not attached). 3 GRNs matched to a vendor by name, not PO (2 TEST-V-1, 1 Janki) — the known LOW.

## INT-03 duplicates — PASS (17/18 zero), 1 history item
- int03-dups.sql: 0 orders with >1 invoice / >1 tax invoice; 0 GRN lines over PO; GRN stock never added twice; 0 delivery taken twice; every sales return has exactly 1 CN and vice versa; returned ≤ delivered; 0 parents with >1 open backorder; 0 incentive dups; 0 delivered orders without invoice; 0 dangling order/PO refs.
- History: lead L11 has O113 (Shipped, ₹2,400), O114 (Delivered, ₹2,400), O115 (Cancelled) — Phase 2 double-click 09-28 18:41, before 066. **O113 still open: delivering it would invoice the same TEST sale twice.** Owner to decide (cancel/delete as TEST data).

## INT-04 audit — PASS, 2 findings (LOW)
- int04-05-audit.sql: all 32 audited tables: 0 rows created after audit start without a 'created' audit row.
- audit_log: SELECT only (Super Admin/Admin/Director); E4/E5: Sales Exec DELETE and Admin UPDATE refused (permission denied). Actor = my_user_id() (forged names only honoured for service-key calls).
- int04-roles.mjs (8 real roles, rolled back): lead (Sales Exec 1, forged updatedBy=U-TEST-ADMIN -> stamped U-TEST-SALES-EXEC-1), payment (Accounts: payment + invoice status + balance rows, all "TEST Accounts", tagged), GRN (Warehouse: grn + inventory + PO + vendor, tagged "goods receipt GRN-P4"), portal order (Distributor), product MRP (Admin), vendor payment (PM), credit note (Accounts), ship order (Dispatch): every row names the signed-in user.
- Null-actor ("System") rows: all are seed (09-25/27), migrations (046-058, 069, 074), reconciliation 09-28, owner-approved clean-ups 10-02/03 — no app user action recorded as System.
- **P4-F2 (LOW-MEDIUM): masters and warehouses have no audit trigger** (A9/A10: Admin adds a lead source / edits a warehouse -> 0 audit rows, 0 events). Master-list changes (statuses, categories, sources) are untraceable. Other unaudited tables are logs themselves (events, notifications, client_write_log, stock_movements, signup_attempts, schema_migrations).
- **P4-F3 (LOW): via tag leaks within a transaction.** app.via is transaction-local, so later statements in the same transaction inherit an earlier trigger's tag: 09-25 seed rows on attendance/beat_plans/complaints/grn/… tagged "delivery of order …"; 10-02 clean-up: 31 order + 3 lead deletions tagged "invoice … deleted". Seen only in maintenance/seed SQL; also maintenance SQL that sets no tag is "System" with no reason (27 groups). Process: tag every maintenance step.
- Sales return on O5 (A11) now refused by 075 ("must go to the partner the invoice is for"): P4-F1 cannot recur, but O5 can take no return until its order gets a partner.

## INT-05 last changed by — PASS with a LOW note
- 0 mismatches on 30 of 32 tables. orders 5 (O109, O111, O114, O57, O141): updatedAt later than last audit = a save that changed nothing; stamp_modified re-stamps updatedBy, audit_row (rightly) logs nothing -> "last changed by" can name someone who changed nothing (P4-F4 LOW). users 4: latest audit row is the hand-written 069 password-rotation note / seed; not a trigger gap.

## RISK-EVT — FIXED (batch 11) and confirmed
- E1/E2: Sales Exec and Distributor insert events; actorEmail stamped by DB (forged one replaced). Since batch 11 events arrived from all 10 roles (Admin 12, Customer Support 4, Sales Exec 3, Distributor/Dealer/Retailer/PM/Sales/Warehouse/Dispatch 1 each). 314 earlier events have no actorEmail (history).
- Notifications are computed in each browser from readable data and stored in localStorage (NotificationContext.jsx); DB table `notifications` holds 1 row (09-28) — unused; partners can't insert into it (E3 refused) — no impact.

## RISK-OVD — PASS (DB), 1 LOW finding (browser notification)
- ovd.sql/.out: Overdue is stored in the DB (057) and set by pg_cron `invoice-status-nightly` (35 18 * * * UTC = 00:05 IST), active; last 5 nights all succeeded (09-28..10-02). 74 invoices: 0 open past-due not Overdue, 0 Overdue not past due. Status values only Unpaid/Partially Paid/Settled/Overdue. 1 Overdue (tax invoice). 3 Settled ones are past due (fine).
- Screens read the stored status (InvoicesTable, ledger). Director "Overdue now" (financials.receivables) uses `dueDate < now` (instant, not the IST day) — can differ from the DB on the due day only.
- **P4-F6 (LOW): "Invoice Payment Overdue" bell notice is browser-only and uses its own rule** (NotificationContext.jsx:117-134): any open invoice (proformas too) created > 15 days ago, ignoring dueDate and the DB status; message uses `inv.total`, which no invoice has -> "Payment of ₹NaN from …". Today 0 invoices qualify (oldest open < 15 days), so latent; first ones will appear about 2026-10-07. Also no bell notice for already-expired batches (only "expiring within 60 days").

## RISK-EXP — PASS for deliveries, 1 MEDIUM finding
- exp.sql/.out: 7 expired batches with stock: Aloevera Skin Gel 150g 1,580 units (6 batches, expired 09-22..10-01), Lavender Body Wash 10 (TEST-P2-EXP-26592). Sellable: Aloevera 25, Lavender 29. 0 deliveries ever taken from a batch already expired that day (stock_movements). Only `deduct_stock` checks `batch_is_sellable`.
- exp-delivery.mjs/.out (real Dispatch role, rolled back; TEST orders set up as Shipped with address): X1 Aloevera 30 -> REFUSED "ordered 30, available 25 (not expired), expired 1580 — expired stock is never delivered"; X2 Aloevera 5 -> delivered from batch cfghbjnmk (no expiry), 1 invoice; X3 Lavender 29 -> from TEST-P2-GRN-L1 (exp 2027-10-31) 20 + TEST-P2-FAR (2027-11-30) 9, the expired batch untouched; X4 Lavender 30 -> REFUSED (29 available, 10 expired).
- **P4-F5 (MEDIUM): an expired batch can be made sellable by editing its expiry date.** X5: Warehouse Manager moved INV-ITEM-1790621555217 (expired 2026-09-28) to 2027-10-03 — accepted, batch sellable again, no reason asked. Only audit_log records it. Anyone with Inventory full can do it from the batch Edit form.
- LOW: X6 a new batch with an expiry already past and X7 a GRN line with expiry 2025-01-01 are accepted without a warning (they stay unsellable, so no wrong delivery).
- Note: rolled-back order inserts still use up order numbers (O304–O311 skipped; sequences don't roll back). No impact.

## RISK-ATT — PASS
- att.sql/.out: bucket `lead-attachments` private, 10 MB limit, 10 allowed types (PDF, images, Word, Excel); policies: insert/delete = can_edit_lead(folder), select = can_view_lead(folder). 1 object (L11 TEST-P2 visiting card PDF, 30 bytes), its lead exists; 0 orphans. No other buckets.
- att-roles.mjs/.out (real roles, rolled back, object row only): add — owner Sales Exec 1 OK; Sales Exec 2, Distributor, Director (view only), Admin into a non-existent lead folder all REFUSED. See — owner, Sales Manager (team), Director OK; Sales Exec 2, Distributor, Accounts see nothing. Delete — Storage blocks direct SQL deletes, so the delete rule was read from the policy (can_edit_lead), not exercised.
- att-download.mjs/.out (Storage API, read-only): Sales Exec 1, Sales Manager, Director: signed URL, HTTP 200, 30 bytes, application/pdf, starts "%PDF-1.4". Sales Exec 2, Distributor: "Object not found". Public URL: HTTP 400 for everyone (bucket private).

## RISK-COLS — PASS
- cols.mjs/.out: all 9 column lists in DataContext (ORDER, LEAD, ATTENDANCE, PRODUCT, MASTER, purchase order, GRN, vendor payment, inventory) match their tables; nothing in a list is missing from its table; the only table columns left out are `updatedBy`/`updatedAt`, which the DB stamps (stamp_modified). masters exact.
- Forms: Orders and Leads form fields are all in their lists (Leads `attachments` goes to Storage by design). SFA visit form's outlet company/city/e-mail/address/pincode go onto the order raised from the visit, not the visit report (by design; with no order they are not kept).
- Unshaped tables: a column the table lacks makes PostgREST refuse the whole write (visible since batch 13), not drop a field. cols-journal.out: 165 save-journal rows (09-28..10-03), 0 column errors (42703/PGRST204).

## RISK-CACHE — PASS (14/14)
- cache.mjs/.out (local, QUIC off, one browser profile): Admin signed in -> 27 tables cached (invoices 74, vendors 4, orders 136…). Sign Out -> only prismora_theme and prismora_data_version left; login page shows nothing of Admin. Then Sales Exec 1 and then Distributor in the same tab: first 4 s never held Admin-sized tables; every cached table's row count = what that user's own API session may read (e.g. Sales Exec 1: orders 27, leads 18, invoices/vendors 0; Distributor: orders 70, invoices 28, masters 0); header not Admin.
- Two tabs (cache-tabs.out): tab B signs out -> tab A goes to the sign-in page at once; tab B signs in as Sales Exec 1 -> shared cache = Sales Exec 1's rows only. Tab A, reloaded on /login, stays on the sign-in form although the browser now holds Sales Exec 1's session (cosmetic: /login doesn't forward a signed-in user). No stale data anywhere.
- Note: `prismora_monthly_target`/`prismora_ytd_target` (dashboard targets) are kept per browser on purpose, so they are shared by whoever uses that browser and are not in the DB (INFO).

## Cleanup check (cleanup-check.out): 0 P4 orders/batches/GRNs/files; Lavender expired batch still 2026-09-28; orders 136, invoices 74 unchanged.
