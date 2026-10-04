# PRISMORA full test — final report (Phases 0–4, fix batches 1–17)

Janki Herbals ERP/CRM · 27 Sept – 4 Oct 2026 · demo/TEST data on the live Supabase project · live site https://prismora-henna.vercel.app

## In one paragraph
All five phases and the carry-over checks are complete, and **all 17 fix batches are done and live** (migrations 040–084). The test found **6 CRITICAL problems in Phase 1, 4 more in Phase 2's stories, 12 CRITICAL report/dashboard mismatches in Phase 2 H, and 6 HIGH in Phase 3. Every CRITICAL, HIGH and MEDIUM finding has been fixed, deployed and checked against the database as the real roles, and so has the LOW clean-up list.** Slow saves were traced to the office network, not the app: HTTP/3 (QUIC) connections stall. The app now stops waiting after 20 s with a clear message. Phase 4's final integrity checks passed 12 of 12; all its findings are fixed except P4-F3, a working practice, and P4-F4, one of two optional audit items. The partner balance was corrected on 3 Oct (migration 079). Only four things are still open (see "Still open").

## How it was tested
- Every role signed in as itself (16 staff and partner roles, plus a second partner chain). Every save was confirmed in the database, never on the screen alone.
- Database rules were proven with "dry runs" as the real roles, with both e-mail and user id set and checked. The changes were made inside a transaction that was always rolled back.
- Backups before each phase and each fix batch. Test records are named TEST….
- No change was kept from a test-only phase. Fixes were made only after the owner approved them.

## Test counts per phase

| Phase | What | Planned | Pass | Fail | Not run / blocked | Findings |
|---|---|---|---|---|---|---|
| 0 Map | Roles, screens, forms, statuses, second partner chain | 7 | 7 | 0 | 0 | — |
| 1 Access and security | Menus, direct URLs, view-only rules, partner isolation, pending/deactivated users | 73 | 44 | 14 | 15 blocked (live writes were not allowed at the time; most re-tested later in batches 1–2) | 22 graded: 6 CRITICAL, 6 HIGH, 7 MEDIUM, 3 LOW (from discrepancies D-01…D-26 + NEW-01…03) |
| 2 A–F Business stories | Lead to cash, things going wrong, procure to stock, field day, partner portal, schemes | 56 | 48 | 7 | 1 (E06 as planned; F03 passed but its free-goods stock part was not tested) | 4 CRITICAL, 4 HIGH, plus MEDIUM/LOW |
| 2 G Admin | Users, roles, deactivate, audit | 5 | 5 | 0 | 0 | 2 HIGH, 1 MEDIUM, 2 LOW (API 114/115, browser 12/12) |
| 2 H Numbers | Dashboards, reports, exports, 73 invoice prints vs DB | 8 | 2 | 6 | 0 | 12 CRITICAL (H1–H12), 2 MEDIUM, 3 LOW |
| 3 Every-button sweep | 7 groups × their roles (35 screen items) | 35 | 31 swept | — | 4 not covered (login/register/shell, layout & theme matrix) | 6 HIGH + slow saves, 19 MEDIUM, ~20 LOW; 52 rolled-back role scenarios |
| 4 Data integrity | Stock, balances, duplicates, audit, cache, columns, attachments, overdue, expiry | 12 | 12 | 0 | 0 | 0 CRITICAL/HIGH, 2 MEDIUM, 4 LOW |
| **Total** | | **196** | **149** | **27** | **20** | |

Phase 2 C includes an extra check (C09), so it has 9 tests. Phase 3 groups were swept screen by screen; the report gives findings per group rather than pass/fail per screen.

## Fixes, batch by batch (all live)

| Batch | Date | What it fixed | Migration(s) | Commit(s) |
|---|---|---|---|---|
| Pre-batch | 26–28 Sept | Field expenses load, GRN stock in the DB, save journal; sign-in gate and saves wait for the first load | 040–042 | acd5a7e, 7a17779 |
| 1 Security | 28 Sept | Reps see only their own data; open tables closed; partners can't re-point, activate or price themselves; invoices by party id; deactivation (D-02…D-07) | 043, 044, 045 | 021f477, 24df82d |
| 2 Roles | 28 Sept | Purchase Manager restored and narrowed; field-expense booking; Accounts payments; credit notes move balances; Sales can send/cancel own order; no false "Access Denied"; order date fix | 046, 047, 050 | ff97351, bb65d3f, 145844a, 5b5d00b |
| 3 Money and stock | 28 Sept | Balances reconciled and moved only by DB; partial GRNs; expired stock never delivered (D-18); GST place of supply (D-17); delivered = final, sales returns; invoice status in DB with nightly Overdue (D-16); seller details from Settings | 048, 049, 051–058 | aec3ef8, cd7fd19, b961de2, a730324, 2a99695, d677a49, 96c887e |
| 4 Attachments | 28 Sept | Lead files stored in private Storage under the lead's rules (D-21); lead ids from the whole table; delete confirms | 059, 060 | 009a015 |
| 5 Phase 2 A–D | 29 Sept | Invoiced orders locked, stages enforced in DB (B10, A09); no silent loss, stale-form warning (B07, B09); vendor balances in DB + drift check; one order per lead; double-save guards; PO with receipts not deletable | 061–068 | 96a31e8, c35de96, 67f2e0d, b1fe5ec, 4ddf4ff |
| Security hotfix | 30 Sept | Passwords in a scheme name removed; 3 demo passwords rotated | 069 | 809191c |
| 6 | 2 Oct | Partner orders earn incentives (DB trigger); backorder invoices to the parent's company; one-per-lead on edit; parent can't be cancelled with an open backorder | 070 | 0695930, ac5d2b9 |
| 7 Admin guards | 2 Oct | Only a Super Admin grants admin roles or touches a Super Admin; create-user checks caller, role and password; Delete User waits | 071, 072 + create-user | f5e8924 |
| 8 | 2 Oct | A user's e-mail can't be edited (new account instead) | 073 | d9a8b51 |
| Phase 2 H (groups 1–4) | 2–3 Oct | GST reports use the stored split; one definition for revenue, profit and receivables; proformas kept apart; Purchases exports; "Ordered" POs → Confirmed; product figures by line item; one low-stock rule; not-found page | 074 | 6704a25, f8e0c51, 96ec499, d0ec8fd, 12ae89a, 2c67c75, fb20a79 |
| 9 Money and stock | 3 Oct | Purchase returns checked and moved in the DB; credit notes capped; issued tax invoices locked; positive-amount checks | 075 | e4532bd |
| 10 Orders | 3 Oct | Portal and staff orders get an owner and territory from the DB; one open backorder; split guard; TEST territory Pune | 076 | bb3a136 |
| 11 Permissions and audit | 3 Oct | Only a Super Admin gives Settings = full; activity events from every role, actor stamped by DB; complaint delete | 077 + create-user | 41fab6d |
| 12 Master data | 3 Oct | Dispatch can't delete orders; Warehouse records GRNs; option lists readable by staff; GSTIN/phone/pincode checks; value rules; products in use can't be deleted or renamed; complaint numbers never reused | 078 | 0de4498 |
| 13 Forms wait for the DB | 3 Oct | Every form and single click waits for the database and shows the outcome; vendor payment Withdraw; view-only Edit | front-end | b1898d3, b54dfa7 |
| 14 Slow saves | 3 Oct | Root cause found: HTTP/3 (QUIC) stall on this network, not the database. Saves now give up after 20 s with a clear message; slow requests journaled | front-end | bc19914 |
| Data correction | 3 Oct | Krishna pharma balance ₹15,680 → ₹3,080: O5, its sales return and credit note linked, audited (P4-F1) | 079 | 47aa4eb |
| 15 Stock in the DB | 3 Oct | An expired batch stays expired (P4-F5); adjust, cycle count and transfer are DB operations with movement rows; no direct quantity writes; option lists and warehouses audited (P4-F2) | 080 | da57434 |
| 15b | 3 Oct | A batch holding stock changes warehouse only by transfer; GRNs write movement rows | 081 | 915c1ab |
| 15c | 3 Oct | Deleting a GRN takes its stock back out; PO status recomputed | 082 | 24c5a47 |
| 16 Partner flow | 4 Oct | Sign-up asks address/pincode, territory from the DB; claims tied to earned incentives, paid once; partner complaints unassigned; partners see only their schemes; free-goods payout in one DB step | 083 + partner-signup v6 | 21a91f1 |
| 17 Screen clean-up | 4 Oct | Bell Overdue from the DB + expired-batch alert (P4-F6); no placeholder reminder contacts; Profile "Order Value Booked"; confirms on approval and auto-booked expense delete; PO cancel note in IST; Reports date filter in whole IST days; 375 px header, partner "Credit Held"; LOW list; GRN items can't be edited; no future-dated expense. Data already loads once per sign-in in production (twice only in the dev build) | 084 | 021391d |

## Still open

| Item | Status |
|---|---|
| **H17 TDS report** | Empty by design. Waiting for the accountant to decide which expense categories carry TDS, and at which section and rate. |
| **Phone-hotspot test** | The owner is checking whether the office network drops idle HTTP/3 connections. The app already copes: saves stop after 20 s with a clear message. |
| **Two optional audit items** | (1) A self sign-up shows "System" as the actor in the audit log. (2) A save that changes nothing re-stamps "last changed by" (P4-F4). Both mean changing triggers shared by every table, so the owner left them out of batch 17. |
| **TEST rows kept on purpose** | Database guards stop these from being deleted, and they serve as test history: O187 (delivered, its invoice, return and credit note), O140, O145, O113 (owner's decision), the TEST-P3 vendor with PO-12, GRN-20/21 and batches TEST-P3-B1/B2, and territory T-TEST-PUNE. |

Each fix batch: a dry run as the real roles first (rolled back), then apply, then check as the real roles locally and live, and confirm in the database.

## Appendix A — Phase 4 findings

| # | Severity | Finding |
|---|---|---|
| P4-F1 | MEDIUM (fixed 3 Oct, 079) | Krishna pharma (DIST-1790265786389) owes ₹15,680 on record; should be ₹3,080. Sales return credit note CN-SR-1790658148634 (₹12,600, 29 Sept) has no partner because order O5 has none; invoice INV-1790265113364 still "Unpaid". Total Outstanding is ₹12,600 too high; the balance check can't see it. |
| P4-F5 | MEDIUM (fixed 3 Oct, 080) | Warehouse Manager moved an expired batch's expiry (TEST-P2-EXP-26592, 28 Sept → 2027) and it became deliverable again; no reason asked (rolled back). |
| P4-F2 | LOW-MEDIUM (fixed 3 Oct, 080) | Option lists (`masters`) and `warehouses` write no audit rows. |
| P4-F3 | LOW (working practice: tag every maintenance step) | The audit "via" tag carries over within a maintenance transaction; 27 maintenance groups show "System" with no reason. |
| P4-F4 | LOW (open, optional) | A save that changes nothing re-stamps "last changed by" with no audit row (O57, O109, O111, O114, O141). |
| P4-F6 | LOW (fixed 4 Oct, batch 17) | The bell's "Invoice Payment Overdue" uses its own 15-day rule (proformas included) and reads "₹NaN"; no notice for already-expired batches. |

## Appendix B — Stock history from before today's rules (INT-01)

All 29 batches and 55 documents since auditing began reconcile exactly. These earlier items are listed with their values as found. None is a new bug.

| Item | Values |
|---|---|
| Before auditing began (25 Sept 13:52) | GRN-1 and GRN-2 ("janki herbals", no PO): 100 + 100 Aloevera into batch BTC2026. That batch is now 0 and has no audit rows. O5 delivered 100 Aloevera on 24 Sept (batch unknown), so up to 100 units of BTC2026 are unexplained. |
| Opening stock = early GRNs | GRN-3 (100, abc123) = opening 100 of INV-ITEM-1790056118706-tnhw. GRN-4 (100, btc2027) = opening 100 of -8yw6. GRN-5 (200, cfghbjnmk) = opening 200 of -wukv. |
| Batches made by hand | Btc2020 Tulsi (INV-ITEM-1790188733140), made 23 Sept 18:38 with no GRN. O1 delivered 100 Tulsi 41 s later. Now 0, no audit rows. INV-ITEM-1790056463204 (abc123), made 22 Sept with opening 0. |
| Seeded documents that never moved stock | TEST-GRN-1 (100 TEST Herbal Shampoo into batch TEST-B5, which doesn't exist); TEST-RET-1 (4 Shampoo, ₹360); TEST-GRN-PM and TEST-RET-PM (no items). |
| Before the GRN trigger (26 Sept) | GRN-6 (+50) and GRN-7 (+70) added by the browser (Admin) to INV-ITEM-1790056463204. GRN-8 (+100) added to INV-ITEM-1790410779080, after a hand-made opening of 100 two minutes earlier. |
| Purchase return before batch 9 | PR-1790664107704: 5 Neem, TEST P2 vendor, −5 on TEST-P2-GRN-N2 by the browser (29 Sept 06:41). |
| Deliveries before the movement log (28 Sept 13:12) | O8, O9, O10, O11, O15, O23, O24, O26, O30, O38, O79, O81, O83, O85, O87, O89, O100: stock moved and audited, but no movement row. O1 and O5 happened before auditing began. |
| Duplicate from a Phase 2 double click (INT-03) | Lead L11 → O113 (Shipped, ₹2,400, still open), O114 (Delivered), O115 (Cancelled). |

---
Detailed reports: `PHASE1-REPORT.md`, `FIX-SUMMARY.md`, `PHASE2-PROGRESS.md`, `phase2/g/PHASE2-G.md`, `PHASE2-REPORT.md`, `phase3/PHASE3-REPORT.md`, `phase4/PHASE4-REPORT.md`; progress table `PROGRESS.md`; migrations ledger `migrations/README.md`.
