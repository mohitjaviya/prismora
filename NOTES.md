# NOTES (temporary — next session)

Full detail: `test-results/full-test/SESSION-STATE.md`, `PHASE2-PROGRESS.md`, `FIX-BATCH-5.md`.

## Fixed (all live, migrations 040–074)
- Security/RLS: reps see own data; partners locked down; deactivated users cut off (043–045)
- Orders: invoiced = locked, no cancel/delete; stages enforced in DB; one order per lead (061–063, 066)
- Saves: leads numbered by DB; save journal + "Leave site?" + SaveGuard banner (`utils/writeJournal.js`, `components/SaveGuard.jsx`) (064)
- Stale-form warning on leads/orders (`utils/staleEdit.js`)
- Vendor balances moved into DB, drift check, Correct tool (065, 067); PO with receipts can't be deleted (068)
- Double-click guards (Leads/Orders), confirms on Mark as Paid / Cancel Order
- Password leak: scheme `SCH-1790405906612` renamed, 3 demo passwords rotated (069)
- Fix batch 6 (070, commit 0695930, live 2026-10-02): F02 incentives raised by DB trigger `orders_earn_incentives` (partner orders now earn; browser no longer writes them); backorder invoice billed to the parent's company via `splitFromOrderId`; `order_one_per_lead` re-checked on `leadId` UPDATE; parent can't be cancelled/deleted while a backorder is open (`order_backorder_open_guard`, also on the Orders screen). 32/32 role checks in `test-results/full-test/fix-batch-6/api.mjs`, confirmed in the DB.

- Fix batch 7 (071+072, create-user v6, commit f5e8924, live 2026-10-02): G findings 1–4. DB guards: only a Super Admin grants Super Admin/Admin/Director or touches a Super Admin account/role; nobody deletes own account or the last active Super Admin; a Settings-full role can't remove its own Settings/switch off/delete itself; deleting a profile deletes its login. create-user checks the caller's current status and real Settings=full permission (a Director is refused), that the role exists, password = 8+ with letter and number. Delete User waits for the database and shows refusals; Add User form offers an Admin only the roles the server allows; Super Admin rows have no controls for non-Super-Admins. Proof: `guards-dryrun.mjs` (33 scenarios as real roles in an always-rolled-back transaction), `g71-api.mjs` 51/51, browser checks `g72-ui*.mjs`.
- **Incident during batch 7 (resolved):** migration 071 as first applied did NOT work (guards were SECURITY DEFINER, so their `current_user` test let everyone through; fixed by 072). My follow-up API test ran against the real rows and succeeded in: editing then deleting the real Super Admin role row, promoting TEST Admin to Super Admin, and creating a TEST Super Admin profile. All restored the same hour from backup `2026-10-02T10-42-24-127Z` (role row re-inserted, TEST Admin back to Admin, test rows deleted); verified: 15 roles, Super Admin settings=full, only 3 real admin accounts. **Lesson learned:** any migration that touches real rows or guards (users, roles, permissions) is first proven in a dry run — install the migration INSIDE a transaction, run the scenarios as the real roles (`SET LOCAL ROLE authenticated` + `request.jwt.claims` e-mail), and end with `RAISE EXCEPTION` so everything rolls back (`guards-dryrun.mjs`, `email-lock-dryrun.mjs`). Make each step its own sub-transaction, make the script fail if it parsed fewer scenarios than it ran (a vacuous 'all good' happened once), and never aim destructive tests at the real Super Admin role or real TEST accounts. Guard triggers must be invoker functions: a SECURITY DEFINER function sees `current_user` as its owner, so a test like `current_user NOT IN ('authenticated','anon')` always passes everyone through.
- Fix batch 8 (073, live 2026-10-02): a user's e-mail can no longer be edited (chosen over re-linking: the login's e-mail lives in Supabase Auth and every policy matches profile e-mail = token e-mail, so re-linking from the browser would add more ways to lock someone out). DB trigger `users_email_locked` (invoker; service key still allowed) + Team Members shows the e-mail read-only with a hint and never saves it. A different e-mail = new account, then deactivate/delete the old one. Proven: `email-lock-dryrun.mjs` 12/12 before applying (rolled back), `g73-api.mjs` 25/25 as Admin and Super Admin (old login keeps working after a refused edit, new account works, deactivate cuts old off, delete removes old login, e-mail reusable), browser check `g73-ui.mjs`. Own-password change from the edit form still works.
- Orphaned logins removed on the owner's OK (2026-10-02): the 9 logins with no profile (rahul@, accounts@, dist@, new@, manager@, surbhi@ prismora.com, zzdiag1789620851737@prismora.com, mohitjaviya@gmail.com, mohitjaviya@prismora.com) were each confirmed to have no profile, no storage files and no audit references, then deleted in one block that aborts unless exactly 9 rows go. Total logins 52 → 43, now equal to the 43 profiles; no login without a profile and no profile without a login. All 9 now refuse sign-in (and are absent from auth.users); TEST Admin control still signs in. Sign-in attempts used a dummy password, so the proof is the absence from auth.users, not the refusal alone.

## Open
- HIGH: slow saves (5–40 s, 4–26 s after sign-in); cause unknown, not reproducible now.
- MEDIUM: self-registered partner has no address/territory (`DistributorSignup.jsx`); claims not tied to earned incentives (`Claims.jsx`).
- LOW: partners can read all schemes; complaint auto-assigned to the partner; deleting auto-booked expense has weak confirm.
- Batch 6 follow-ups (done 2026-10-02): Sales Manager lead check proven (insert refused with 'Lead L30 has already been converted to order O179'; Sales Manager has no UPDATE right on orders so a lead edit changes 0 rows; Admin/Super Admin/Dispatch/Warehouse get the same clear refusal). Browser check on live: Admin placed an order for TEST P2E Distributor (single product, qty 10 = ₹1,100) and the Incentives screen showed ₹55 Discount Earned. Batch 6 TEST data deleted (orders O152–O182, leads L28–L30, 5 incentives, 4 invoices, 4 stock movements; 6 units put back on TEST-INV-1 → 439); before/after snapshot showed nothing else changed. O145 and O140 left as they are on purpose. Browser tooling: `playwright-core` is installed only in the session scratchpad (Chrome at C:/Program Files/Google/Chrome), not in the repo.
- Small: no confirm on partner approval; audit actor "System" at sign-up; "Expires in 1 days".
- Phase 1 leftovers: see `FIX-SUMMARY.md` (D-08, D-13, D-14, D-24, D-25, forms validation).
- Fixed this session: split backorders no longer copy the parent's `leadId` (`DataContext.jsx`, commit ac5d2b9; 066 had broken splits of lead-sourced orders). Verified live.
- Test rows O147–O151 (split tests) were deleted on the owner's OK; the database was checked afterwards (no orphaned invoices, stock entries or lead links).

## Decisions
- Partner orders need Processing step (Sales Manager/Admin) first.
- Janki balance corrected to ₹1,21,500; GRN-1/GRN-2 ("janki herbals") not attached.
- Latest backup: `backups/2026-10-02T18-38-14-389Z` (taken before 074).
- Test-only phases: report findings, fix only on owner approval.

## Phase 2 H — CLOSED (2026-10-03): H1–H16 fixed and live, H17 parked
Report: `test-results/full-test/PHASE2-REPORT.md`; evidence and check scripts: `test-results/full-test/phase2h/` (each group checked local + live, as real roles, against SQL).
- Owner decisions applied everywhere: revenue/profit = Accounting's definition (net sales = paid tax invoices ex-GST − credit notes ex-GST; profit = net sales − expenses − goods bought); proformas out of every sales, receivable and GST figure (shown apart as "Pending invoicing"); Total Outstanding = positive partner balances only, "Total Credit Held" shown separately.
- Group 1 GST reports (6704a25): `utils/gstReport.js`; Invoice Register + GSTR-1 read stored CGST/SGST/IGST, proformas excluded. Live = DB: CGST/SGST ₹4,392.50, IGST ₹683, 52 tax invoices.
- Group 2 money figures (f8e0c51, 96ec499, d0ec8fd): `utils/financials.js` is the one source for Accounting, Director, Dashboard, Reports. Live = DB (2026-10-03): net sales ₹24,019.69, net profit −₹2,20,699.31, GST to remit ₹2,582.11 (net of credit-note GST), receivables ₹42,167 (22), Total Outstanding ₹27,513, Credit Held ₹80,096.20. Order-value figures relabelled "Orders Booked"/"Order Value".
- Group 3 purchases/exports (12ae89a, migration 074): PO export Total, Vendors Address, Returns Items/Quantity fixed; Orders CSV items readable; "Ordered" POs renamed Confirmed (074, audited, backup `2026-10-02T18-38-14-389Z`), TEST-PO-1 receivable (proven, rolled back). TEST-PO-PM cancelled through the app by TEST Purchase Manager on the owner's OK (2026-10-03; DB: Cancelled, audited, no GRN, vendor balance unchanged ₹4,839).
- Group 4 product/display (fb20a79): product figures by line items, cancelled excluded; one low-stock rule (`stockStatus`/`needsReorder`, Reports 9 = Inventory 9); paise shown in Reports; "Page not found" page.

## Awaiting business decision (not a bug)
- **H17 TDS report is empty — awaiting accountant input.** Not a filter bug: the report covers Rent, Salaries, Marketing, Logistics (offered only in Accounting's Log Expense form) and no expense has been logged under them. Actual expenses come from SFA field expenses (master list `expense_category`: Travel, Fuel, Food & Meals, …) and auto-booked scheme payouts (Scheme Incentive / Scheme Claim). The accountant must decide whether partner payouts or any SFA categories carry TDS (and at which section/rate) before the report's category map changes. Do nothing until then.

## Not yet covered by a check (future)
- Dealer/Retailer Incentives and Stock pages (script didn't wait for "Loading…"); Director "Top States" and Admin "Lead Status" charts (checked from code/data only); Reports date-range filters (all checks ran unfiltered).
- Small bug seen 2026-10-03: the PO cancel note is dated in UTC ("Cancelled on 2026-10-02" at 00:xx IST on 3 Oct).

## Next (priority)
1. Phase 3 (every-button sweep), Phase 4 (integrity); final report.
2. Later batch: slow saves, self-registered partner address/territory, claims tied to earned incentives, missing confirms, Phase 1 leftovers, PO cancel-note date (UTC).
3. Optional: delete the batch 6 TEST rows on owner's OK.
