# NOTES (temporary — next session)

Full detail: `test-results/full-test/SESSION-STATE.md`, `PHASE2-PROGRESS.md`, `FIX-BATCH-5.md`.

## Fixed (all live, migrations 040–069)
- Security/RLS: reps see own data; partners locked down; deactivated users cut off (043–045)
- Orders: invoiced = locked, no cancel/delete; stages enforced in DB; one order per lead (061–063, 066)
- Saves: leads numbered by DB; save journal + "Leave site?" + SaveGuard banner (`utils/writeJournal.js`, `components/SaveGuard.jsx`) (064)
- Stale-form warning on leads/orders (`utils/staleEdit.js`)
- Vendor balances moved into DB, drift check, Correct tool (065, 067); PO with receipts can't be deleted (068)
- Double-click guards (Leads/Orders), confirms on Mark as Paid / Cancel Order
- Password leak: scheme `SCH-1790405906612` renamed, 3 demo passwords rotated (069)

## Open
- HIGH F02: partner-placed orders create no incentive (RLS on `distributor_incentives`; created in `DataContext.generateIncentivesForOrder`). Not fixed.
- HIGH: slow saves (5–40 s, 4–26 s after sign-in); cause unknown, not reproducible now.
- MEDIUM: self-registered partner has no address/territory (`DistributorSignup.jsx`); claims not tied to earned incentives (`Claims.jsx`).
- LOW: partners can read all schemes; complaint auto-assigned to the partner; deleting auto-booked expense has weak confirm.
- Small: no confirm on partner approval; audit actor "System" at sign-up; "Expires in 1 days".
- Phase 1 leftovers: see `FIX-SUMMARY.md` (D-08, D-13, D-14, D-24, D-25, forms validation).
- Invoice for a backorder (migration 039 `insert_invoice_for_order`): bills the person, not the company, because the backorder has `leadId` null. Fix: use the parent's company via `splitFromOrderId`. Preferred over a new `sourceLeadId` field.
- 066 trigger gaps (`order_one_per_lead`): an UPDATE that sets `leadId` is not checked; no guard when the parent is cancelled while its backorder is still open.
- Fixed this session: split backorders no longer copy the parent's `leadId` (`DataContext.jsx`, commit ac5d2b9; 066 had broken splits of lead-sourced orders). Verified live.
- Test rows O147–O151 (split tests) were deleted on the owner's OK; the database was checked afterwards (no orphaned invoices, stock entries or lead links).

## Decisions
- Partner orders need Processing step (Sales Manager/Admin) first.
- Janki balance corrected to ₹1,21,500; GRN-1/GRN-2 ("janki herbals") not attached.
- No fresh backup taken; only complete backup is `backups/2026-09-28T05-34-37-801Z`.
- Test-only phases: report findings, fix only on owner approval.

## Next (priority)
1. Ask owner: fix E–F findings first, or run Phase 2 G–H?
2. Fix F02 (DB-side incentive creation) if approved.
3. Phase 2 G (admin/roles/audit) and H (reports vs DB); write `PHASE2-REPORT.md`.
4. Phase 3 (every-button sweep), Phase 4 (integrity); final report.
5. Phase 1 medium/low leftovers; optional slow-save timing log.
