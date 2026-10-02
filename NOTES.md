# NOTES (temporary — next session)

Full detail: `test-results/full-test/SESSION-STATE.md`, `PHASE2-PROGRESS.md`, `FIX-BATCH-5.md`.

## Fixed (all live, migrations 040–070)
- Security/RLS: reps see own data; partners locked down; deactivated users cut off (043–045)
- Orders: invoiced = locked, no cancel/delete; stages enforced in DB; one order per lead (061–063, 066)
- Saves: leads numbered by DB; save journal + "Leave site?" + SaveGuard banner (`utils/writeJournal.js`, `components/SaveGuard.jsx`) (064)
- Stale-form warning on leads/orders (`utils/staleEdit.js`)
- Vendor balances moved into DB, drift check, Correct tool (065, 067); PO with receipts can't be deleted (068)
- Double-click guards (Leads/Orders), confirms on Mark as Paid / Cancel Order
- Password leak: scheme `SCH-1790405906612` renamed, 3 demo passwords rotated (069)
- Fix batch 6 (070, commit 0695930, live 2026-10-02): F02 incentives raised by DB trigger `orders_earn_incentives` (partner orders now earn; browser no longer writes them); backorder invoice billed to the parent's company via `splitFromOrderId`; `order_one_per_lead` re-checked on `leadId` UPDATE; parent can't be cancelled/deleted while a backorder is open (`order_backorder_open_guard`, also on the Orders screen). 32/32 role checks in `test-results/full-test/fix-batch-6/api.mjs`, confirmed in the DB.

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
- Latest backup: `backups/2026-10-02T09-38-09-985Z` (taken before 070).
- Test-only phases: report findings, fix only on owner approval.

## Next (priority)
1. Phase 2 G (admin/roles/audit) in progress, then H (reports vs DB); write `PHASE2-REPORT.md`. Stop after G and report before H.
2. Phase 3 (every-button sweep), Phase 4 (integrity); final report.
3. Later batch: slow saves, self-registered partner address/territory, claims tied to earned incentives, missing confirms, Phase 1 leftovers.
4. Optional: delete the batch 6 TEST rows on owner's OK.
