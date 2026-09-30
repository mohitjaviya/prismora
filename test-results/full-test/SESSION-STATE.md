# PRISMORA: session state and hand-over (last updated 2026-09-30)

Written so a future session with no memory of this project can pick up.

**Status:** everything below is **committed, deployed and verified on live**, except where marked in-progress or stopped.

| Item | Where |
|---|---|
| Live site | https://prismora-henna.vercel.app |
| Supabase project | `qvckvvckkfvelhnxmmvp` |
| Branch | `fix/erp-session-2026-09`, fast-forwarded into `main` (Vercel deploys `main`) |
| Last commit | see `git log -1` on `main` (this doc committed together with migration 069) |
| Last migration | `069` |

All data is **demo/TEST data**.

## 1. Read first (in this order)

1. **This file.**
2. `test-results/full-test/FIX-SUMMARY.md`: Phase 1 fixes (Batches 1–4) and the Phase 1 findings never fixed.
3. `test-results/full-test/FIX-BATCH-5.md`: Batch 5 (Phase 2 findings): what, why, tests, decisions.
4. `test-results/full-test/PHASE2-PROGRESS.md`: Phase 2 stories A–D results and findings.
5. `migrations/README.md`: the ledger of every migration, with what each does and how to deploy it.
6. `test-results/full-test/MAP.md`: roles, screens and statuses. Written before the fixes, so check against the code.

**Safe to skip unless needed:**
- `PHASE1-REPORT.md` and `FIX-BATCH-1..3*.md` (summarised in FIX-SUMMARY).
- `phase2/*.json` and `fix-batch-*/*.json` (per-test detail).
- `screenshots/`.
- Older notes in `PROGRESS.md`.

## 2. Every fix, by migration (all applied to the database and live)

| Migration | What | Batch |
|---|---|---|
| 040–041 | Audit log and last-changed stamps; GRN adds stock in the database (before the test programme) | – |
| 042 | `client_write_log` (the save journal's log) | 1 |
| 043, 044, 045 | Access security: rep-owned leads and orders, closed open tables, partner self-edit locks, database-priced partner orders, invoices by party id, deactivation; partner cancel and receipt rules | 1 |
| 046, 047, 050 | Role fixes: Purchase Manager, field expenses, Accounts payments, credit notes, sales moving own orders; PM least access | 2 |
| 048, 049 | Balance reconciliation, balances move only in the database, drift check, events read split | 3 |
| 051 | Partial goods receipts (Partially Received) | 3 |
| 052 | Expired stock never sold or delivered; PO-1 reopened | 3 |
| 053 | GST place of supply (CGST+SGST vs IGST) fixed at issue; company settings | 3 |
| 054, 055, 056 | A delivered order is final; sales returns with stock back to the batch and a credit note | 3 |
| 057 | Invoice status from payments (Unpaid, Partially Paid, Settled, Overdue); nightly pg_cron | 3 |
| 058 | Brand line and jurisdiction from Settings, kept per invoice | 3 |
| 059 | Lead attachments in Storage, guarded like the lead | 4 |
| 060 | Next ids from the whole table (reps could not add leads) | 4 |
| **061** | B10: an invoiced order's value, quantity and items are locked (all roles) | 5 |
| **062** | A09: order stages one step at a time, each by its owner, address required from Processing on, new orders start at Pending | 5 |
| **063** | An invoiced order can't be cancelled or deleted; O113/O118 corrected back to their invoices (audited) | 5 |
| **064** | B07: leads numbered by the database, saved in one request | 5 |
| **065** | Vendor balances move in the database with receipts, returns and payments; direct writes refused; `vendor_balance_drift()` | 5 |
| **066** | A06: one non-cancelled order per lead | 5 |
| **067** | `correct_vendor_balance()` (Accounts/admin, audited) | 5 |
| **068** | A PO with goods receipts can't be deleted; vendor correction takes an audit reason | 5 |
| **069** | **Security fix (2026-09-30):** renamed scheme `SCH-1790405906612` off a name that held three demo accounts' emails and passwords in plain text (found in Phase 2 story E02 — any signed-in partner can read every scheme's name). Renamed to "TEST Distributor Scheme 5pct". The three passwords (`newdistributor@gmail.com`, `demodealer@gmail.com`, `demoretailer@gmail.com`) were rotated directly in `auth.users` (not committed — same technique as `scripts/create-test-accounts.mjs`, temp SQL file deleted right after running); new values are in `.env.test-accounts.local` (git-ignored) under `DEMO_*`. Each account's password rotation is audit-logged with the reason. | Phase 2 E |

**App-side fixes in Batch 5 (no migration):**
- **Save journal (B07).** "Leave site?" while a save is in flight; unfinished saves are recorded at leave time and listed on the next page by the SaveGuard banner; a failure after leaving is announced.
- **Stale-form warning (B09).** On leads and orders: "Someone else changed this…", with Load theirs / Overwrite with mine.
- **Double-click guards.** On leads, orders and lead conversion.
- **Confirmations.** On Mark as Paid and Cancel Order.
- **Vendor ledger pop-up.** Refreshes, and entries are in the right order.
- **Balance check.** Accounting's Balance check covers vendors, with a "Correct" action.
- **Order screen.** Only the next stage is offered; invoiced fields are locked; database refusals are shown as written.

**Owner decisions recorded:**
- Partner orders now need the Processing step (Sales Manager or Admin) before the Warehouse can act.
- Janki Herbal was corrected to ₹1,21,500 on 2026-09-29 (GRN-17 under-charge).
- The 2026-09-29 backups were incomplete, and the owner skipped a new one. The only complete backup is `backups/2026-09-28T05-34-37-801Z`, from before migrations 041–068 and all test data.
- The password-leak fix (069) was explicitly approved and directed by the owner on 2026-09-30, including the rename text and which three accounts to rotate.

## 3. What has been tested

| Phase | Status |
|---|---|
| Phase 0 (map) and Phase 1 (access and security) | Done; findings fixed in Batches 1–4 (except the leftovers in section 4) |
| Phase 2 A: lead to cash | Done (16/18; both failures fixed in Batch 5) |
| Phase 2 B: things going wrong | Done (6/10; all four failures fixed in Batch 5) |
| Phase 2 C: procure to stock | Done (9/9) |
| Phase 2 D: field sales day | Done (9/9) |
| Batch 5 fixes | Each tested as the real role through the database and the screen, locally and on live |
| **Phase 2 E: partner portal** | **In progress — E01, E02 passed; stopped at E03 (see below)** |
| **Phase 2 F: schemes and incentives** | **In progress — F01 passed; stopped at F02 (see below)** |
| **Phase 2 G: admin (users, roles, deactivate, audit)** | **Not started** |
| **Phase 2 H: reports and dashboards vs data** | **Not started** |
| **PHASE2-REPORT.md** | **Not written** (planned for after E–H) |
| **Phase 3: every-button sweep** | **Not started** (plan in PROGRESS.md) |
| **Phase 4: data integrity** | **Not started** |
| **Final report** | **Not started** |

## 3a. Phase 2 E–F: where testing stopped (2026-09-30)

**Passed:**
- **E01** — a distributor registered through the public sign-up form, was approved by Admin, and could then sign in.
- **E02** — the new distributor's dashboard shows only its own data (no other partner's orders, invoices, or leads visible).
- **F01** — a new scheme created by Admin behaves correctly for eligibility and discount calculation.

**Stopped at E03 / F02** (placing an order as the newly approved distributor, then checking the scheme/incentive applies to it). Reason: ran low on session usage mid-story, not a test failure or blocker.

**Open question, not yet investigated:** when E03 was reached, the newly approved distributor's order screen did not appear to list the TEST products used elsewhere in this test programme (e.g. `TEST Neem Face Wash 100ml`). Before continuing E03/F02, check **whether this is correct behaviour by design** (e.g. products scoped to a specific distributor/territory/price-list assignment that a brand-new partner doesn't have yet) **or a bug** (a newly approved distributor should see the full active product catalogue, same as any other distributor, and doesn't). This needs a straight comparison against an existing working distributor account (`TEST_DISTRIBUTOR` in `.env.test-accounts.local`) to see whether it sees the same products or more.

**Not started:** E03 (retry/continue), E04, E05, E06, F02 (retry/continue), F03, F04, and all of Phase 2 G and H.

## 4. Unresolved items

**Minor notes from Phase 2 E–F, not fixed (all low severity):**
- No confirmation prompt when Admin approves a partner registration (one click, no "are you sure").
- Audit log actor mismatch on one sign-up flow: some rows show `System` as actor where the actual registrant's action would be more accurate/expected.
- Scheme card grammar: "Expires in 1 days" (should be "1 day").

**Test data:**
- **TEST Herbal Raw Materials Co (TEST-V-1):** its balance is ₹3,839 below its records. Left as is, by decision. It is the only row in the vendor Balance check.
- **GRN-1 and GRN-2** (21 Sept, "janki herbals", ₹16,500, no PO): not attributed to any vendor. Not confirmed as Janki's, so not attached.
- **GRN-17's Aloevera batch "abc765"** expired on its receipt date, so it was never sellable.

**Slow saves (HIGH, cause unknown):**
- All 25 logged slow saves (5–41 s) happened 4–26 s after sign-in. They still occur occasionally.
- On the current build, measured saves took 0.3–0.9 s; the cause was not reproduced.
- They can no longer be lost silently (Batch 5 group 2).
- **Future improvement:** log, per save, when its request was sent and when the answer came, so the next slow one shows which half is slow.

**Phase 1 medium/low never fixed** (see FIX-SUMMARY):
- D-08: view-only roles see some write buttons.
- D-13: activity events not written for most roles.
- D-14: master lists readable only by settings roles.
- D-15: role cards.
- D-23: incentives on order creation.
- D-24: Purchases export field names.
- D-25: hard-coded reminder contact.
- D-26: docs.
- Form validation: phone, GSTIN, pincode, duplicates.
- Double-submit guards on other forms: SFA route, claims, PO, vendor, expense and others.

**Smaller notes:**
- The vendor pop-up's per-row running "Bal:" matches receipts by exact vendor name, so it can differ from the header, which is correct.
- The stale-form warning (B09) covers leads and orders only.
- **Known lint (pre-existing):** DataContext has 28 lint problems, Accounting 1 and Purchases 5. None are new.

## 5. How to work on this project (what the owner expects)

**Stop rules:**
- Stop and tell the owner on any blocked or denied command, any failed safety check, or any write, migration or deploy that goes wrong.
- Stop after the same script fails 3 times.
- Tell the owner if auto mode comes back on.

**Database changes:**
- Each database change is a **new numbered migration** (next: `070`). Never edit old ones.
- Apply with `npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/0NN_….sql`.
- Add an entry to `migrations/README.md`.

**Testing:**
- Test as the real role's own login (`.env.test-accounts.local`; never print passwords). Admin SQL only for before/after reads.
- Name all test records `TEST…`.
- Confirm every save against the **database**, not just the screen.

**Deploy (only when the owner approves):**
1. Commit on `fix/erp-session-2026-09`.
2. Push.
3. `git checkout main && git merge --ff-only fix/erp-session-2026-09 && git push origin main`.
4. Check `npx vercel ls prismora` and that the live bundle carries the change.
5. Verify on live.

**Reporting:** plain, short, what was tested and the result; each group is reported, then stop for approval.

**Test scripts:** the scratch browser driver (Chrome DevTools, headless) lived in the session's temp scratchpad, which gets wiped. Recreate a small driver if needed: sign in through `#login-email-address` / `#login-password`, drive the pages, and read the database.

## 6. Resume from here

**Phase 2 story E–F testing is mid-flight, stopped at E03/F02** (see section 3a). The session ended on low usage, not a blocker — this was a clean stop, not a crash.

**To resume:**
1. **First**, check the open product-list question from section 3a: sign in as `TEST_DISTRIBUTOR` (an established, already-approved account) and as the E03 test's newly-approved distributor account, and compare what each sees in the order/product screen. Confirm whether the difference (if any) is by design or a bug before writing it up.
2. Then continue E03 (place the order) and F02 (confirm the scheme/incentive applied correctly to that order).
3. Continue through E04–E06, F03–F04.
4. Then Phase 2 G (admin/roles/audit) and H (reports/dashboards vs. data).
5. Write `PHASE2-REPORT.md` once E–H are done.

Other than resuming E–F, the owner's next decision is one of:
- fix more of the leftovers in section 4 first;
- or look into the slow-save timing log.

Ask which before starting anything not listed above.
