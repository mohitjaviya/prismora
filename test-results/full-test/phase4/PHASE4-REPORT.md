# Phase 4 — Data integrity and known risks

Date: 2026-10-03. Live database (demo/TEST data). Report only: nothing was fixed, migrated or deployed.
Every write was made inside a transaction that was rolled back, signed in as the real role (e-mail and user id both set and checked). Browser checks ran on the local app against the live database.
Backup before Phase 4: `backups/2026-10-03T16-09-11-712Z`. Scripts, SQL and raw output: this folder (`findings.md` has the working notes).

## Result

| ID | Check | Result | Findings |
|---|---|---|---|
| P4-INT-01 | Stock per batch rebuilt from its history | **pass** | 29 batches and 55 documents match exactly since auditing began; older history listed below |
| P4-INT-02 | Partner balances | **pass** (25/25) | P4-F1 MEDIUM (Krishna pharma) |
| P4-INT-03 | Duplicates (invoices, GRNs, deliveries, returns, backorders) | **pass** (17/18 zero) | O113 still open (history) |
| P4-INT-04 | Every change audited with the right person | **pass** | P4-F2 LOW-MEDIUM, P4-F3 LOW |
| P4-INT-05 | "Last changed by" = latest audit row | **pass** | P4-F4 LOW |
| P4-INT-06 | Vendor balances | **pass** (4/4) | — |
| P4-RISK-EVT | Activity events from every role | **pass** (fixed in batch 11) | — |
| P4-RISK-CACHE | Browser cache after sign-out / another user | **pass** (14/14) | — |
| P4-RISK-COLS | Form fields silently dropped | **pass** (9/9 lists match) | — |
| P4-RISK-ATT | Lead attachments stored and downloadable | **pass** | — |
| P4-RISK-OVD | Overdue kept in the database | **pass** | P4-F6 LOW (bell notice) |
| P4-RISK-EXP | Expired batches never delivered | **pass** for deliveries | P4-F5 MEDIUM (expiry date editable) |

**12 of 12 checks pass. 6 findings: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 4 LOW.**

## Findings

| # | Severity | What | Evidence |
|---|---|---|---|
| P4-F1 | MEDIUM | **Krishna pharma (DIST-1790265786389) shows ₹15,680 owed; it should be ₹3,080.** Order O5 has no partner. During the 28 Sept reconciliation only its invoice INV-1790265113364 (₹14,000 + ₹1,680) was linked to the partner. The ₹12,600 sales return of 29 Sept ("Damaged in transit") took the partner from the order, so credit note CN-SR-1790658148634 belongs to nobody and never came off the balance. The invoice still shows Unpaid with ₹15,680 due. Total Outstanding is ₹12,600 too high. The balance check can't see it (it uses the same link). Since batch 9 this can't happen again (a return now must go to the invoice's partner), but O5 can take no further return until the order gets its partner. | int02-partners.sql; int04-roles A11 |
| P4-F5 | MEDIUM | **An expired batch can be made sellable again by editing its expiry date.** As Warehouse Manager, Lavender batch TEST-P2-EXP-26592 (expired 28 Sept) was moved to 2027: accepted with no reason asked, and the batch was deliverable again. Only the audit log records it. (Rolled back.) | exp-delivery X5 |
| P4-F2 | LOW-MEDIUM | `masters` (option lists) and `warehouses` have no audit trigger. Adding a lead source or editing a warehouse leaves no audit row and no event. | int04-roles A9, A10 |
| P4-F3 | LOW | The "via" tag on audit rows carries over to later statements in the same transaction. Seen only in seed and maintenance SQL (for example clean-up deletes labelled "invoice … deleted"); 27 maintenance groups show "System" with no reason. Process fix: tag every maintenance step. | int04-05-audit.sql |
| P4-F4 | LOW | Saving an order without changing anything re-stamps "last changed by" but (rightly) writes no audit row, so "last changed by" can name someone who changed nothing (O57, O109, O111, O114, O141). | int04-05-audit.sql |
| P4-F6 | LOW | The bell's "Invoice Payment Overdue" notice is worked out in the browser with its own rule: any open invoice (proformas included) more than 15 days old, whatever its due date or stored status. Its text reads "Payment of ₹NaN" because it uses a field invoices don't have. No invoice qualifies yet; the first will about 7 Oct. Also: no bell notice for batches that have already expired. | NotificationContext.jsx:117-134 |

Smaller notes (no action needed): a batch or GRN line can be entered already expired (it stays unsellable); rolled-back tests used up order numbers O304–O311 (gaps only); a tab left on /login does not move on when another tab signs in; dashboard targets are kept per browser, not in the database.

## What was checked

**INT-01 stock.** All 29 live batches were rebuilt from the audit log (opening, GRNs, deliveries, sales returns, purchase returns and withdrawals, app edits). 0 unaudited writes and 0 end mismatches. 55 documents (18 GRNs, 14 sales returns, every delivery since 28 Sept) match their stock move exactly. Still open, known: adjust, cycle count, transfer and add-batch are browser writes with no `stock_movements` row (the audit log has them).

**INT-01 history (before the current rules; values as found, not new bugs):**

| Item | Values |
|---|---|
| Before auditing began (25 Sept 13:52) | GRN-1 and GRN-2 ("janki herbals", no PO): 100 + 100 Aloevera into batch BTC2026. That batch is now 0 and has no audit rows. O5 delivered 100 Aloevera on 24 Sept (batch unknown), so up to 100 units of BTC2026 are unexplained. |
| Opening stock = early GRNs | GRN-3 (100, abc123) = opening 100 of INV-ITEM-1790056118706-tnhw. GRN-4 (100, btc2027) = opening 100 of -8yw6. GRN-5 (200, cfghbjnmk) = opening 200 of -wukv. |
| Batches made by hand | Btc2020 Tulsi (INV-ITEM-1790188733140), made 23 Sept 18:38 with no GRN. O1 delivered 100 Tulsi 41 s later. Now 0, no audit rows. INV-ITEM-1790056463204 (abc123), made 22 Sept with opening 0. |
| Seeded documents that never moved stock | TEST-GRN-1 (100 TEST Herbal Shampoo into batch TEST-B5, which doesn't exist); TEST-RET-1 (4 Shampoo, ₹360); TEST-GRN-PM and TEST-RET-PM (no items). |
| Before the GRN trigger (26 Sept) | GRN-6 (+50) and GRN-7 (+70) added by the browser (Admin) to INV-ITEM-1790056463204. GRN-8 (+100) added to INV-ITEM-1790410779080, which had a hand-made opening of 100 two minutes earlier. Accounted for, but by app writes. |
| Purchase return from before batch 9 | PR-1790664107704 (5 Neem, TEST P2 vendor): −5 on TEST-P2-GRN-N2 by the browser, 29 Sept 06:41. Accounted for. |
| Deliveries before the movement log (28 Sept 13:12) | O8, O9, O10, O11, O15, O23, O24, O26, O30, O38, O79, O81, O83, O85, O87, O89, O100: stock moved and audited, but no movement row. O1 and O5 happened before auditing began. |

**INT-02 partner balances.** For all 25 partners, the stored balance = invoices (amount + tax, tax invoices and proformas) − payments − credit notes. My rebuild, the database helper and the stored figure agree. The balance-drift checks return 0 rows as Accounts, Admin, Super Admin and Purchase Manager. Control: a planted ₹1 (rolled back) is seen by Accounts. A recompute of every invoice status (rolled back) changed nothing. The 19 invoices and 2 credit notes with no partner are walk-ins (by design).

**INT-06 vendor balances.** TEST-V-1 ₹4,839; Janki ₹1,53,500; TEST P2 Vendor ₹1,021; TEST-P3 Vendor ₹400. All match their GRNs, payments and returns. Not attached to any vendor: GRN-1 and GRN-2 ("janki herbals", ₹16,500), by owner decision. 3 GRNs are matched to their vendor by name rather than PO (known LOW).

**INT-03 duplicates.** 0 orders with more than one invoice; 0 GRN lines over their PO; 0 stock added twice; 0 deliveries taken twice; every sales return has exactly one credit note; returned ≤ delivered; 0 parents with two open backorders; 0 duplicate incentives; 0 delivered orders without an invoice; 0 dangling references.
- History: lead L11 has O113 (Shipped, ₹2,400), O114 (Delivered) and O115 (Cancelled), from a Phase 2 double click before migration 066. **O113 is still open: delivering it would bill the same TEST sale twice.** Owner to decide (cancel it as TEST data).

**INT-04/05 audit.** On all 32 audited tables, every row created since auditing began has a "created" row. The audit log is read-only: a Sales Exec delete and an Admin edit were both refused. Eight real roles (rolled back) each did one action (lead with a forged "updated by", payment, GRN, portal order, product price, vendor payment, credit note, shipping) and every audit row named the signed-in user. Rows marked "System" are all seed data, migrations, the 28 Sept reconciliation or clean-ups the owner approved. "Last changed by" matches on 30 of 32 tables (see P4-F4).

**RISK-EVT.** Since batch 11, events arrive from all 10 roles that have acted. The database stamps the actor (a forged one is replaced). 314 older events have no actor (history). The `notifications` table is unused (the bell is worked out in each browser), so a partner being refused an insert there has no effect.

**RISK-CACHE.** In one browser: Admin signs in (27 tables cached), then signs out. Only the theme and version keys are left, and the sign-in page shows nothing of Admin. Sales Exec 1 and then the Distributor sign in on the same tab. Never, in the first 4 s, did the cache hold Admin-sized tables, and every cached table matched exactly what that user's own login may read. With two tabs, signing out in one sends the other to the sign-in page, and the shared cache then holds only the new user's rows.

**RISK-COLS.** The 9 column lists in the data layer (orders, leads, attendance, products, option lists, POs, GRNs, vendor payments, inventory) match their tables exactly. The only columns left out are "updated at/by", which the database stamps. Every field on the Orders and Leads forms is in its list. Lead attachments go to Storage. The SFA visit's outlet address and contact go onto the order raised from the visit. The save journal (165 entries since 28 Sept) shows 0 "column not found" errors.

**RISK-ATT.** The bucket is private, with a 10 MB limit and 10 file types. As the real roles (rolled back): the lead's owner can add a file; another exec, a partner, the Director (view only) and an Admin adding to a lead that doesn't exist are all refused. The owner, their Sales Manager and the Director can see the file; another exec, a partner and Accounts can't. Through the real Storage API, the first three downloaded the stored PDF (HTTP 200, 30 bytes, a valid PDF); the others got "Object not found". The public URL is refused. No orphaned files. (Deletes can only go through the Storage API, so the delete rule was read from the policy, not exercised.)

**RISK-OVD.** Overdue is stored in the database and set every night at 00:05 IST by a scheduled job. It ran successfully on each of the last 5 nights. Across all 74 invoices, the stored status matches the due date and payments: 0 out of step. The screens read the stored status. For the bell notice, see P4-F6.

**RISK-EXP.** On hand: 1,580 expired Aloevera units (6 batches) and 10 Lavender; sellable stock is 25 and 29. As the real Dispatch role (rolled back):
- Delivering 30 Aloevera was refused: "ordered 30, available 25 (not expired), expired 1580 — expired stock is never delivered".
- Delivering 5 Aloevera took them from an unexpired batch.
- Delivering 29 Lavender took them from the 2027 batches only.
- Delivering 30 Lavender was refused.
- No past delivery ever took from a batch that had already expired.

The gap is P4-F5.

## Suggested next steps (owner to choose)
1. P4-F1: link O5 to Krishna pharma and give CN-SR-1790658148634 its partner (a one-off correction, audited and tagged), then re-run the balance check. Expected result: ₹3,080.
2. P4-F5: in the database, refuse moving an expiry date later on a batch that has already expired (or require Admin and a reason).
3. P4-F2: add the audit trigger to `masters` and `warehouses`.
4. O113: cancel it as TEST data.
5. LOW items (P4-F3, F4, F6) can go into a later clean-up batch.
