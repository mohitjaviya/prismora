# Phase 3 — every-button sweep (running report)

## Group 1: SFA (done 2026-10-03) — roles: Sales Executive 1, Sales Manager; local dev vs live DB
Read-only: all 7 tabs, every safe button/modal opener/Cancel — 0 page errors, 0 blank screens (sfa-ro-*.log).
Writes (each confirmed in DB, then TEST-P3 rows deleted; counts back to baseline): expense (dbl-click -> 1 row), amount 0 refused, punch in/out, beat assign (dbl-click), early request -> manager approve, Not-visited report, expense approve (auto-booked in Accounting) / reject, attendance approve.

Findings
- MEDIUM  Audit gap: a Sales Executive's saves (expense, punch in/out, early request, visit report) send an audit event that RLS refuses (403 on POST /events; `events` insert needs 'reports' permission). Nothing is shown; no audit row exists. Manager-side actions did log.
- LOW  Manager approving/rejecting an SFA expense or attendance wrote no audit event (only beat create + early-check-in decision appear).
- LOW  Beat Assign, Submit Claim, Punch In are fire-and-forget (no await, no success/failure message; modal closes at once). A failed write would look like success (SaveGuard journal is the only net).
- NOTE  GPS "Get My Location" not verifiable headless (no geolocation); punch-in saved with null lat/lng.

### GPS re-check (2026-10-03)
Headed Chrome, location permission granted, position set: Punch In saved punchInLat 22.556 / punchInLng 72.951 / accuracy 25 in the DB; location link shown; GPS tab showed the same. So capture works; the earlier empty save was the headless browser having no location (code then saves without location by design). Real-device GPS accuracy not testable here. Row deleted.

## Group 2: Partner (done 2026-10-03) — Distributor, Dealer, Retailer
Read-only (crawl-*.log): 10 pages each (Dashboard, Orders, Ledger, Claims, Incentives, Stock, Price List, Schemes, Complaints, Profile), all filters/tabs, all exports, modals open/close — 0 page errors.
Writes (partner-w*.log), confirmed in DB then deleted: one order per role (O183/O184/O185; empty cart -> Submit disabled; qty 0 refused; same product twice merges; dbl-click -> 1 order), one complaint per role (name locked to partner; dbl-click -> 1 row), one claim (Distributor; Dealer/Retailer have no claimable scheme).

Findings
- HIGH (owner: top priority for the post-Phase-3 fix batch; breaks the Fix Batch 5 Processing step; 5 historical orders) Partner portal orders get no owner and no territory. Partners can't read `territories` (RLS returns []), so `assigneeForPortalOrder` finds nothing and the order saves with assignedTo = null, territoryId = null, though all 3 TEST partners have territory "Demo Gujarat" with an executive. Result: the Sales Manager's Orders screen does not list them (the DB lets the manager read them; the screen filter `canAccessData(o.assignedTo)` hides them). Only Admin/Dispatch see them, yet the agreed flow needs Sales Manager/Admin to move Pending -> Processing. Older partner orders (O41, O43, O37, O46, O129) are the same.
- MEDIUM Same audit gap as SFA: partner saves (order, complaint, claim) -> 403 on POST /events; no audit row.
- LOW  Export with no rows (Claims, Incentives, Complaints when empty) uses a native browser alert ("No data available to export", `utils/exportUtils.js:18`) instead of a toast or a disabled button.
- LOW  Complaint double-click: the second insert hits HTTP 409 (same CMP id) and fails silently. Only one row is saved, so the outcome is right, but it's noisy and the ids are worked out in the browser.
- KNOWN (already open) Complaint assigned to the partner itself (assignedTo = U-TEST-DISTRIBUTOR); claims not tied to earned incentives (claim form offers any of 71 orders, or none).
- NOTE  Partner sidebar sections (Operations/Financials/Customer Support) are collapsed by default; pages are reachable.

## Group 3: Sales (done 2026-10-03) — Sales Manager, Sales Executive 1, Sales
Read-only (crawl-SALES*.log, crawl2-*.log): Dashboard, Leads (table/board, export, Add Lead, Edit lead), Customers (export, paging), Geography (both tabs) — 0 page errors. "Sales" role has no leads/customers of its own (pages load, lists empty).
Writes (sales-w*.log), confirmed in DB (lead L28, order O186, audit_log) then deleted:
- empty name blocked ("Please fill in this field"); Add Lead double-click -> 1 lead; plain edit saved (audit: notes changed by exec).
- stale edit: exec form open, manager saves, exec saves -> "Someone else changed this lead" shown with the manager's change; "Load theirs" reloads the manager's notes; exec's stale text never reached the DB. Works.
- convert (status "First Order"): Create order disabled at qty 0; double-click -> 1 order (O186, Pending, owner = exec, delivery address/pincode saved, ₹200); lead marked orderCreated. Single-product orders store items = [] by design (`utils/leadConversion.js`).
- delete: confirm shown; Cancel keeps the lead; Delete removes it (audit: created + deleted by exec).

Findings
- HIGH (adds evidence to the open slow-saves item) The stale-edit save showed "Saving…" for ~7–8 s before the conflict warning appeared (twice). A first run with a 3 s wait looked like "no warning". Normal lead saves finished within 4 s.
- MEDIUM Same audit-event gap: Sales Executive saves -> 403 on POST /events (the row-level audit_log does record them).
- NOTE  ERR_NAME_NOT_RESOLVED seen once in the read-only pass (Customers paging), at the time the dev server was stopped. Re-ran Customers + Leads 4 times (2 roles x 2) with failed-request logging: 0 failed requests. Transient DNS/network blip, not an app issue.
