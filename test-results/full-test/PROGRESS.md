# Prismora Full Test: Progress

Statuses: `not started`, `pass`, `fail`, `blocked`, `n/a`. Failures go in REPORT.md with their ID, role, screen, steps, expected and actual results, screenshot (in `screenshots/`) and severity.

## Run log

- 2026-09-28: **Fix Batch 2** (roles): migration 046 applied to the Supabase project; app code committed locally, not deployed. See `FIX-BATCH-2.md`. Backup: `backups/2026-09-28T11-21-12-929Z`.
- 2026-09-28: **Save protections and session gate** deployed (7a17779). The order-date fix (5b5d00b) is committed but not deployed.

- 2026-09-28: **Fix Batch 1** (security) built and tested on the demo database: migrations 043 and 044, app changes on branch fix/erp-session-2026-09 (not deployed). Results in `FIX-BATCH-1.md`. Backup in use: `backups/2026-09-28T05-34-37-801Z` (owner said to skip a new one).
| When | Phase | Note |
|---|---|---|
| 2026-09-27 | 0 | Backup taken before starting: **`backups/2026-09-27T11-02-58-101Z`** (via `node scripts/make-backup.mjs`). Restore: `node scripts/restore.mjs backups/2026-09-27T11-02-58-101Z` |
| 2026-09-27 | 0 | Created the second partner chain, insert-only, with a scratch script modelled on `scripts/create-test-accounts.mjs` (the repo script was not changed): **U-TEST-DISTRIBUTOR-2 → D-TEST-2**, **U-TEST-DEALER-2 → DL-TEST-2** (parent D-TEST-2), **U-TEST-RETAILER-2 → R-TEST-2** (parent DL-TEST-2). All three are in Maharashtra/Mumbai with no territory, for the IGST case. Credentials were appended to `.env.test-accounts.local` as `TEST_DISTRIBUTOR_2_*`, `TEST_DEALER_2_*` and `TEST_RETAILER_2_*`. REST smoke test: each signs in and sees only its own chain |
| 2026-09-28 | 0 | MAP.md written. **Phase 0 complete.** |
| 2026-09-28 | 1 | Backup before Phase 1: **`backups/2026-09-28T05-34-37-801Z`** |
| 2026-09-28 | 1 | **Writes to the live project were refused by the session permission system** at the first seeding attempt, so no write tests were run: every write-dependent test is `blocked`. The read-only and browser tests are done. Results: PASS 44, FAIL 14, BLOCKED 15. See PHASE1-REPORT.md |
| 2026-09-28 | 1 | Per the owner, `supabase/tests/delete_test_data.sql` gained a commented block that removes the second chain (not run) |

Notes for later phases:
- `supabase/tests/delete_test_data.sql` removes partner payments only for `D-TEST-1` and leaves the `-1` partner records commented out. The **-2 chain and its payments are not covered** unless their ids or names start with TEST (orders and invoices are, because their customer names start with "TEST"). This is for the owner to extend if wanted; it was not changed.
- Only one territory exists (Demo Gujarat). D-TEST-2 has no territory on purpose.
- Legacy role **Manager** has no test login, so it is tested only through the matrix (DB row is identical to Sales Manager).

## Phase 0: Map
| ID | Test | Status |
|---|---|---|
| P0-01 | Backup taken and recorded | pass |
| P0-02 | Roles, access matrix and enforcement mapped (MAP §1) | pass |
| P0-03 | Screens, routes and controls mapped (MAP §2) | pass |
| P0-04 | Form fields and validation mapped (MAP §3) | pass |
| P0-05 | Statuses, transitions and automatic effects mapped (MAP §4) | pass |
| P0-06 | Earlier report's pending and verify items listed (MAP §5) | pass |
| P0-07 | Second distributor, dealer and retailer accounts created | pass |

## Phase 1: Access and security

### 1A. Menu and direct URL, per role (15 signable roles plus 3 second partners)
For each role:
- **-MENU:** the sidebar shows exactly the modules with view or full in the live `roles` row (MAP §1.3).
- **-URL:** every forbidden route typed directly redirects to `/?denied=1` with the access-denied toast. This covers the 21 module routes plus `/masters/*` and `/settings`.

| ID | Role | Status |
|---|---|---|
| P1-MENU-SA / P1-URL-SA | Super Admin | pass / pass |
| P1-MENU-AD / P1-URL-AD | Admin | pass / pass |
| P1-MENU-DIR / P1-URL-DIR | Director (Settings shows only Audit Log and Activity) | pass / pass |
| P1-MENU-SM / P1-URL-SM | Sales Manager | pass / pass |
| P1-MENU-SE1 / P1-URL-SE1 | Sales Executive 1 | pass / pass |
| P1-MENU-SE2 / P1-URL-SE2 | Sales Executive 2 | pass / pass |
| P1-MENU-SAL / P1-URL-SAL | Sales (legacy) | pass / pass |
| P1-MENU-PM / P1-URL-PM | Purchase Manager (check against the DB row, and note D-01) | pass / pass |
| P1-MENU-WH / P1-URL-WH | Warehouse Manager | pass / pass |
| P1-MENU-ACC / P1-URL-ACC | Accounts | pass / pass |
| P1-MENU-DSP / P1-URL-DSP | Dispatch Team | pass / pass |
| P1-MENU-CS / P1-URL-CS | Customer Support | pass / pass |
| P1-MENU-DIS / P1-URL-DIS | Distributor | pass / pass |
| P1-MENU-DEA / P1-URL-DEA | Dealer | pass / pass |
| P1-MENU-RET / P1-URL-RET | Retailer | pass / pass |
| P1-MENU-P2 | DISTRIBUTOR_2, DEALER_2, RETAILER_2 (same menus as their first-chain counterparts) | pass |

### 1B. View-only modules: buttons hidden on screen AND the database refuses with the role's own token
| ID | Role | Module (view) | What to try (screen, then API) | Status |
|---|---|---|---|---|
| P1-VIEW-01 | Director | Leads | Add/Edit/Delete/drag hidden?; API insert, update, delete `leads` refused | fail |
| P1-VIEW-02 | Director | SFA | Assign Beat / File Expense hidden?; API insert `beat_plans`, `sfa_expenses` refused | fail |
| P1-VIEW-03 | Director | Orders | Add/Edit/Delete/stepper hidden?; API update and delete `orders` refused | fail |
| P1-VIEW-04 | Director | Inventory, Purchases, Distributors, Dealers, Retailers, Schemes, Complaints, Claims, Incentives, Customers, Geography | Buttons hidden; API writes refused | pass |
| P1-VIEW-05 | Sales Manager | Orders, Inventory, Distributors, Dealers, Retailers, Schemes, Complaints, Claims, Incentives | Same | fail |
| P1-VIEW-06 | Sales Exec / Sales | Orders (D-09: "Assign to Warehouse Manager" / Cancel); Customers; Geography; Schemes | Record exactly what the screen does when the DB refuses | fail |
| P1-VIEW-07 | Purchase Manager | Orders; plus DB-granted Schemes, Ledger, Incentives, Stock, Price List (D-01) | Same | fail |
| P1-VIEW-08 | Warehouse Manager | Purchases (view): Create PO, GRN, Vendor, Return, Payment hidden; API refused | pass |
| P1-VIEW-09 | Accounts | Customers, Orders, Purchases, Distributors, Dealers, Retailers, Schemes | Same; include Record Payment (D-12) | fail |
| P1-VIEW-10 | Dispatch Team | Inventory (view) | Add Batch, Adjust, Transfer, Count hidden; API refused | pass |
| P1-VIEW-11 | Customer Support | Leads, Orders, Schemes | Same | fail |
| P1-VIEW-12 | Partners | Orders (portal only), Ledger, Incentives, Stock, Price List, Schemes | No staff actions; API: update another column on own order (D-05), insert `distributor_payments`, update `invoices`, `schemes` refused | pass (Batch 1, 043: partner order edits, payments, invoice, scheme, claim and credit-limit writes all refused) |
| P1-VIEW-13 | All non-admin | Masters, Team, Roles, Products | API writes to `roles`, `users` (another user), `products`, `masters` refused | blocked |
| P1-VIEW-14 | All | Open tables (D-03) | Partner and staff tokens: read, insert and delete on `bank_transactions`, `notifications`, `stock_transfers`, `warehouses` | pass (Batch 1, 043: refused for partner and Sales Exec; notifications own-only) |
| P1-VIEW-15 | Sales Exec 1 | Owner scoping (D-02) | Screen shows only own leads and orders; API: can SE1 read SE2's leads, orders and SFA rows? | pass (Batch 1, 043: SE1 sees none of SE2's leads or orders) |
| P1-VIEW-16 | Sales Manager | Team scoping | Sees SE1 and SE2 SFA rows; not other reps' (API) | pass |

### 1C. Partner isolation (screen and API)
| ID | Pair | Check | Status |
|---|---|---|---|
| P1-ISO-01 | D-TEST-1 vs D-TEST-2 | Orders: neither sees the other's (screen, `orders` API) | pass |
| P1-ISO-02 | D-TEST-1 vs D-TEST-2 | Invoices, including the name-match path (D-06) | pass |
| P1-ISO-03 | D-TEST-1 vs D-TEST-2 | Ledger and payments (`distributor_payments`) | pass |
| P1-ISO-04 | D-TEST-1 vs D-TEST-2 | Claims (`scheme_claims`) | pass |
| P1-ISO-05 | D-TEST-1 vs D-TEST-2 | Complaints | pass |
| P1-ISO-06 | D-TEST-1 vs D-TEST-2 | Incentives, Stock page | pass |
| P1-ISO-07 | DL-TEST-1 vs DL-TEST-2 | ISO-01 to ISO-06 for dealers | pass |
| P1-ISO-08 | R-TEST-1 vs R-TEST-2 | ISO-01 to ISO-06 for retailers | pass |
| P1-ISO-09 | Distributor vs its own dealer | A distributor sees its child dealer's party row (by design), but not the dealer's orders or invoices? Record the behaviour | pass |
| P1-ISO-10 | Partner self-edit (D-04) | Partner PATCHes its own `users.distributorId` to another id, then reads. Must be refused | pass (Batch 1, 043: refused, "You can change only your own name") |
| P1-ISO-11 | Partner insert for another | Insert an order or claim with another partner's id: refused | pass (Batch 1, 043: order sent for D-TEST-2 saved as D-TEST-1, priced by the DB) |

### 1D. Pending partner, deactivated user, permission change
| ID | Check | Status |
|---|---|---|
| P1-PEND-01 | Register a TEST distributor via `/register`: login says "awaiting approval" | pass (Batch 1: registration through partner-signup lands Pending; via API, not the /register screen) |
| P1-PEND-02 | Pending token (signed in via REST): reads of orders, invoices, products and parties return nothing | pass (Batch 1: pending token reads no orders or partner records) |
| P1-PEND-03 | Pending token: write attempts (orders, claims, complaints) refused | pass (Batch 1: pending token complaint insert refused) |
| P1-PEND-04 | Pending token: PATCH own `users.status='Active'` (D-04 self-approval). Must be refused | pass (Batch 1, 043: self-approval refused) |
| P1-PEND-05 | Admin approves the partner, and it can now sign in | pass in part (Batch 1: approving the partner activates its login in the DB; sign-in after approval not yet run) |
| P1-DEACT-01 | There is no deactivate control in Team Members (D-07). Record it | pass (Batch 1: Deactivate/Reactivate in Team Members) |
| P1-DEACT-02 | Delete a TEST user while they are signed in, in another browser: are they signed out, and does the next action fail? | pass (Batch 1: tested with Deactivate rather than Delete — open session signed out in 8 s with the reason) |
| P1-DEACT-03 | The deleted user can't sign back in | pass (Batch 1: sign-in refused, "deactivated") |
| P1-DEACT-04 | (DB check) Is a user with status other than Pending or Rejected, for example 'Inactive', still granted access? Read the code/DB only; don't mutate real users | pass (Batch 1, 043: Inactive gets no data, reads or writes) |
| P1-PERM-01 | Admin changes a TEST-affecting role permission (e.g. Customer Support: schemes none → view), and the affected user sees it after refresh | pass in part (Batch 2: an admin gave Customer Support Geography and it opened on a direct load, NEW-01; the change was made through the API as the admin, not through the Roles screen) |
| P1-PERM-02 | Audit log shows the role change with the admin's name and old → new permissions | pass (Batch 2: audit row shows TEST Admin and old → new permissions) |
| P1-PERM-03 | Revert the change; audit again | pass (Batch 2: reverted; audited) |
| P1-PERM-04 | Guards: Super Admin row not editable; own Settings access can't be removed | blocked |
| P1-PERM-05 | Discrepancy D-01 (Purchase Manager row) confirmed and reported, not changed | pass (Batch 2, 046: Purchase Manager restored to 010; Purchases full kept) |
| P1-PERM-06 | D-14 master lists invisible to non-admins; D-15 Director role card shows all full | fail |

## Phase 2: Business stories (each ends with a DB check of stock, balances, invoices, ledger and audit)

**Resume notes (Phase 2 run, started 2026-09-29):**
- Scripts: scratchpad `p2/` (`lib.mjs`, `a1.mjs`, …). Shared ids are in `p2/state.json`. Per-test results are in `phase2/story-*.json`, screenshots in `screenshots/phase2/`, and the group write-up in `PHASE2-PROGRESS.md`.
- Test only: no fixes, no deploys. Stop at the end of each group (A-B, C-D, E-F, G-H).
- Baseline 2026-09-29: balance check clean (no drift rows); D-TEST-1 ₹39,033.20, D-TEST-2 ₹3,916, DL-TEST-1 ₹2,535, DL-TEST-2 ₹300, R-TEST-1 ₹2,671, R-TEST-2 ₹0. Lavender Body Wash stock 0.
- Story A lead: L11 "TEST P2 Lead Sharma 30423" (SE1).
- Stories C and D done 2026-09-29: C 9/9 and D 9/9 pass; findings in PHASE2-PROGRESS.md (vendor balance moved by the browser; first vendor payment most likely lost as a slow save). **Next: group E–F, waiting for the owner (may fix the CRITICAL findings first).**
- Story B done 2026-09-29; group A–B written up in PHASE2-PROGRESS.md (22 pass, 6 fail). **Next: group C–D, waiting for the owner's "continue".**
- Story A done 2026-09-29. Records: lead L11; orders O114 (lead, walk-in), O113/O115 (duplicates from A06), O116 (double-click lead TEST-P2-DBL-79137), O117 (D-TEST-1), O118 (D-TEST-2), O119 (R-TEST-2); GST invoices INV-1790621645160/-954342/-973293/INV-1790622335658; overdue INV-1790654942828 (DL-TEST-1); return SR-1790655371164 / CN-SR-1790655371164; Lavender batches TEST-P2-EXP/NEAR/FAR-26592. O113 was set to Shipped by the Warehouse through the API (A09 finding) and is left that way. Balance check clean at the end of A.

### A. Lead to cash
| ID | Step | Role | Status |
|---|---|---|---|
| P2-A01 | Create a TEST lead with every field, an attachment, a follow-up and notes | Sales Exec 1 | pass |
| P2-A02 | Edit the lead; check that every field persisted after a hard refresh (attachment expected lost, D-21) | SE1 | pass |
| P2-A03 | Move through every status (Lead Created → … → Negotiation → Distributor Approved), including Lost and back | SE1 | pass |
| P2-A04 | Sales Manager sees the lead and the rep's activity | SM | pass |
| P2-A05 | Convert with 3+ products and a missing address: the app warns, the order stays Pending | SE1 | pass |
| P2-A06 | Second conversion refused (same tab, a second tab, and a double click) | SE1 | fail (stale tab and same-instant double click each made a duplicate order) |
| P2-A07 | SE1 "Assign to Warehouse Manager" (Pending → Processing): record the DB outcome (D-09) | SE1 | pass |
| P2-A08 | Address added; Ready for Dispatch by Warehouse; Shipped by Dispatch | WH, DSP | pass |
| P2-A09 | Wrong-role status change attempted (e.g. Warehouse sets Delivered, Sales sets Shipped) | WH, SE1 | fail (Warehouse can set Shipped via the API, skipping stages and the address rule) |
| P2-A10 | Deliver with insufficient stock: blocked with a clear message (screen and DB) | DSP | pass |
| P2-A11 | Add stock (TEST batches with different expiries), then deliver: earliest expiry used first; proforma created; partner charged the subtotal | WH, DSP | pass |
| P2-A12 | Accounts converts the proforma: GST per product rate, rounding, extra GST charged to the partner | ACC | pass |
| P2-A13 | Same-state (D-TEST-1, Gujarat) vs different-state (D-TEST-2, Maharashtra): CGST+SGST vs IGST on print (D-17) | ACC | pass |
| P2-A14 | Partial payment then the remainder: record what the app does (no Partially Paid status, D-16); ledger correct | ACC / ADMIN | pass |
| P2-A15 | Mark Paid as Accounts (D-12): payment row and balance | ACC | pass (MEDIUM: Mark as Paid has no confirm and no message) |
| P2-A16 | Past-due invoice shows Overdue on screen and in the DB | ACC | pass |
| P2-A17 | Partial customer return: credit note; stock back? (D-22); balance reduced | ACC | pass |
| P2-A18 | Audit log shows every step with the right person, and "System" only for automatic effects | ADMIN | pass |

### B. Things going wrong
| ID | Step | Status |
|---|---|---|
| P2-B01 | Cancel a Pending order | pass |
| P2-B02 | Try to cancel a Delivered order (Admin): report stock, invoice and balance (D-19) | pass |
| P2-B03 | Deliver the same order twice (two tabs, and a double click) | pass |
| P2-B04 | Invoice the same order twice (two tabs, and a double click) | pass |
| P2-B05 | Convert the same proforma twice (two tabs, and a double click) | pass |
| P2-B06 | Double-click "Save Order" and "Save Lead" (no busy guard): duplicates? | fail (same-instant double click saves twice; 120 ms apart is guarded) |
| P2-B07 | Refresh mid-save: `window.__prismoraWriteLog` and `client_write_log` rows captured | fail |
| P2-B08 | Close a form without saving: nothing written, and no stale draft | pass |
| P2-B09 | Stale tab after another user changed the record: what wins | fail (stale form overwrites the other user's change) |
| P2-B10 | Edit an order after it is invoiced (value is editable): invoice or balance mismatch? | fail (invoiced order value can be changed; order and invoice disagree) |

### C. Procure to stock
| ID | Step | Status |
|---|---|---|
| P2-C01 | Purchase Manager creates a TEST vendor | pass |
| P2-C02 | PO with several products; Confirm | pass |
| P2-C03 | Partial GRN with batch and expiry: stock up once per batch (DB) | pass |
| P2-C04 | GRN for the rest: record whether the screen allows it (D-20) | pass |
| P2-C05 | GRN larger than the PO: allowed? | pass |
| P2-C06 | Purchase return as Purchase Manager: stock reduced? (D-01 / D-22-style) Vendor balance | pass |
| P2-C07 | Vendor payment and vendor ledger | pass (retest); first attempt most likely a slow save lost on navigation |
| P2-C08 | Warehouse Manager views the PO, GRN and returns (read only) | pass |

### D. A field sales day
| ID | Step | Status |
|---|---|---|
| P2-D01 | Sales Manager creates beat plans for SE1 and SE2 (today and tomorrow) | pass |
| P2-D02 | Rep punches in (GPS) and checks in on today's beat | pass |
| P2-D03 | Early check-in on tomorrow's beat: request; SM approves; rep can check in | pass |
| P2-D04 | Visit report with 3+ products and an order | pass |
| P2-D05 | Cab expense claim with an amount (and a receipt) | pass |
| P2-D06 | Rep signs out and in on a different browser: the claim is still there | pass |
| P2-D07 | SM sees and approves the claim (D-11) | pass |
| P2-D08 | Claim appears in Accounting → Expenses with the rep's name | pass |
| P2-D09 | Attendance register and leaderboard update | pass |

### E. Partner portal
| ID | Step | Status |
|---|---|---|
| P2-E01 | Register a new TEST distributor; admin approves | pass |
| P2-E02 | Distributor checks the dashboard, price list, schemes, own orders, ledger and stock | pass (but can read the password-bearing scheme — CRITICAL finding) |
| P2-E03 | Distributor places an order; the price is taken from the tier | pass (order created, priced and visible correctly; no address on a self-registered partner) |
| P2-E04 | Distributor raises a complaint; Customer Support resolves it | pass |
| P2-E05 | Distributor raises a claim; Accounts settles; expense shows "Booked automatically" | pass |
| P2-E06 | Distributor confirms receipt of a delivered order | not run as planned (partner confirms receipt of a delivered order needs a delivered order for the new distributor); the "Booked automatically" label check was run instead, at the owner's scope: pass |

### F. Schemes and incentives
| ID | Step | Status |
|---|---|---|
| P2-F01 | Create a TEST scheme (discount %, and free goods) | pass |
| P2-F02 | Qualifying orders: incentive amount correct; created at order time (D-23) | fail on partner path (HIGH); pass on staff path |
| P2-F03 | Mark Paid; free goods stock movement (D-23) | pass for Mark Paid + Book them (Discount incentive, ₹55); free-goods stock movement NOT tested (no free-goods scheme created) |
| P2-F04 | "Book them" (missing payouts): amounts correct, not attributed to the clicker | pass |

### G. Admin
| ID | Step | Status |
|---|---|---|
| P2-G01 | Create a TEST user of each role type (Team Members / create-user) | not started |
| P2-G02 | Edit one; try to change another user's password (refused with a message) | not started |
| P2-G03 | Change a role's permissions (see P1-PERM) | not started |
| P2-G04 | Deactivate a user (no control: D-07; use Delete) | not started |
| P2-G05 | Each action is in the audit log with the admin's name and old → new | not started |

### H. Reports and dashboards (any mismatch is CRITICAL)
| ID | Check | Status |
|---|---|---|
| P2-H01 | Dashboard KPIs vs DB (orders, revenue, leads) | not started |
| P2-H02 | Director cockpit: ageing, state sales, leaderboard vs DB | not started |
| P2-H03 | Accounting Overview: net sales, GST collected, expenses, COGS, payables, profit, outstanding vs DB; chart income includes tax | not started |
| P2-H04 | Reports: Sales Summary, by Product, by City, Order Status vs DB | not started |
| P2-H05 | Reports: Stock Summary, Low Stock, Expiry vs inventory | not started |
| P2-H06 | Reports: Invoice Register, Outstanding Receivables, Expense, P&L, TDS vs DB | not started |
| P2-H07 | Reports: Lead Pipeline, Lead Source, Complaint Analysis, Sales Exec Performance, Distributor Outstanding, Active Schemes | not started |
| P2-H08 | Partner dashboards: outstanding, orders and incentives vs DB | not started |

## Phase 3: Every-button sweep (per screen in MAP §2)

For each screen:
- Every button, tab, filter, search, sort, pagination and export (open the file).
- Forms: blank submit; each required field left empty; negative, zero, decimal and huge numbers; long text; special characters; Gujarati and Hindi text; duplicates; invalid GSTIN, phone and pincode.
- Saving: shows "Saving…", can't be double-submitted, shows an error on failure, never closes without saving.
- Empty states.
- Layout at 1440, 768 and 375 px, in light and dark.
- Popups close on outside click and Escape, except the AI chat.

| ID | Screen | Status |
|---|---|---|
| P3-01 | Login | not started |
| P3-02 | Register and 3 signup forms | not started |
| P3-03 | Shell: sidebar, topbar search, bell, theme, sign out, AI widget | not started |
| P3-04 | Dashboard (generic) | not started |
| P3-05 | Director cockpit | not started |
| P3-06 | Partner dashboards (3) | not started |
| P3-07 | Leads (table, board, detail, form, convert) | not started |
| P3-08 | SFA (7 tabs, 4 popups) | not started |
| P3-09 | Customers | not started |
| P3-10 | Geography | not started |
| P3-11 | Orders (form, stepper, partial, split, receipt) | not started |
| P3-12 | Partner order screens (3) | not started |
| P3-13 | Inventory (batch, adjust, count, transfer) | not started |
| P3-14 | Purchases (4 tabs, 7 popups; exports D-24) | not started |
| P3-15 | Stock | not started |
| P3-16 | Price List | not started |
| P3-17 | Accounting (4 tabs, 4 popups, print) | not started |
| P3-18 | Schemes | not started |
| P3-19 | Ledger | not started |
| P3-20 | Claims | not started |
| P3-21 | Incentives | not started |
| P3-22 | Complaints | not started |
| P3-23 | Reports (18 reports and exports) | not started |
| P3-24 | AI Insights | not started |
| P3-25 | ML Lab | not started |
| P3-26 | Distributors | not started |
| P3-27 | Dealers | not started |
| P3-28 | Retailers | not started |
| P3-29 | Option Lists | not started |
| P3-30 | Team Members | not started |
| P3-31 | Product Catalogue | not started |
| P3-32 | Roles & Permissions | not started |
| P3-33 | Settings (audit, activity, password) | not started |
| P3-34 | Profile | not started |
| P3-35 | Responsive and theme matrix (1440/768/375 × light/dark) across all screens | not started |

## Phase 4: Data integrity and known risks
| ID | Check | Status |
|---|---|---|
| P4-INT-01 | Stock per product and batch = GRNs − deliveries − purchase returns + customer returns ± adjustments | not started |
| P4-INT-02 | Partner balance (`outstandingAmount`) = invoices (amount + tax) − payments − credit notes, for every TEST party | not started |
| P4-INT-03 | No order has more than one invoice; no GRN added stock twice | not started |
| P4-INT-04 | Every change made during testing has an audit row with the right actor ("System" only for automatic changes) | not started |
| P4-INT-05 | "Last changed by" matches the latest audit entry (sample per table) | not started |
| P4-INT-06 | Vendor balance = GRN value − payments − returns | not started |
| P4-RISK-CACHE | localStorage cache across browsers and after sign-out (another user on the same browser sees stale data?) | not started |
| P4-RISK-COLS | Silent data loss: form fields not in the `*_COLUMNS` lists (compare every form with the table columns) | not started |
| P4-RISK-ATT | Lead attachments stored and downloadable? (D-21) | not started |
| P4-RISK-OVD | Overdue status and reports correct when nobody opens the app (D-16) | not started |
| P4-RISK-EVT | Events and notifications missing for roles without reports full (D-13) | not started |
| P4-RISK-EXP | Expired batches used for delivery (D-18) | not started |

## Final report
| ID | Item | Status |
|---|---|---|
| FIN-01 | REPORT.md: counts per phase; CRITICAL/HIGH first; then MEDIUM/LOW; untestable items; fix order | not started |

**Planned tests (Phases 1–4 plus final): 189**

- Phase 1: **73**: 1A 31 (15 roles × MENU/URL, plus 1 row for the second partners), 1B 16, 1C 11, 1D 15
- Phase 2: **68**: A 18, B 10, C 8, D 9, E 6, F 4, G 5, H 8
- Phase 3: **35**
- Phase 4: **12**
- Final: **1**

Phase 0 adds 7 items, all pass.


## Fix Batch 5 (Phase 2 findings), started 2026-09-29

- Group 1 (B10 + A09): migrations 061 and 062, commit 96a31e8, deployed and verified live. Details in FIX-BATCH-5.md. Group 1 follow-up (063, c35de96) and Group 2 (064, 065, 67f2e0d) deployed and verified live. Group 3 investigated (not reproduced; see FIX-BATCH-5.md). Group 4 a–d done (066, 067, b1fe5ec), deployed and verified live. GRN-17 explained (Admin User's test PO-10, deleted after receipt). **Batch 5 complete; next decision is the owner's (Phase 2 E–H or more fixes).**
- Scratch scripts: `scratchpad/b5/` (the temp scratchpad was wiped once; helpers were recreated there).

## Phase 2 E–H run (started 2026-09-30)

- E01 pass: TEST P2E Distributor 35167 = DIST-1790706652956 / user U1790706652956, registered on the public page, approved by Admin. Login kept in scratchpad `p3/newdist.json`; the password is never printed.
- E02 pass. **CRITICAL finding:** scheme SCH-1790405906612's name contains three accounts' passwords, and every partner can read it (database, plus the Schemes "All" filter and Export).
- F01 pass: scheme SCH-1790706947005, "TEST P2F Neem 5 pct 35167" (5% on TEST Neem, distributors, min ₹500, 30 Sept → 31 Oct).
- **STOPPED at E03/F02** (the new distributor's first order). The ordering script (`p3/f2.mjs`) failed 3 times; stopped per the rules.
  - Cause of the last failure: the partner's Place New Order list did not offer the TEST products, so nothing was added and no order request was sent.
  - Earlier failures: empty CLI replies (the read helper now retries).
- **E–F finished 2026-10-02** (product-list question answered: a test-script fault, not an app issue; the partner list shows every product, valued by id). Results and findings are in PHASE2-PROGRESS.md. E01–E05 pass; F01, F03, F04 pass; **F02 fails (HIGH): partner-placed orders create no incentive.** New distributor login (TEST_P2E_DIST_*) is in `.env.test-accounts.local`.
- Not yet run: G, H (and E06 as planned, F03 free goods).
- **CRITICAL finding fixed 2026-09-30 (migration 069):** scheme SCH-1790405906612 renamed to "TEST Distributor Scheme 5pct"; the three exposed demo account passwords (newdistributor@, demodealer@, demoretailer@gmail.com) rotated and audit-logged. See SESSION-STATE.md.
- Open question before resuming E03/F02: does the newly-approved distributor correctly see TEST products, or only certain products by design? Not yet investigated — check against `TEST_DISTRIBUTOR` first.

## Phase 1 fixes: done (2026-09-28)

- Batches 1–4 are applied, deployed and verified on live, using migrations 042–060. See FIX-SUMMARY.md for the full list.
- The medium and low findings still open are listed at the end of FIX-SUMMARY.md.
- Next: Phase 2.
