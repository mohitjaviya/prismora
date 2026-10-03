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
- NOTE  (G3) ERR_NAME_NOT_RESOLVED seen once in the read-only pass (Customers paging), at the time the dev server was stopped. Re-ran Customers + Leads 4 times (2 roles x 2) with failed-request logging: 0 failed requests. Transient DNS/network blip, not an app issue.

## Group 4: Orders (2026-10-03) — Admin, Sales Manager, Dispatch, Warehouse, Accounts
Read-only (crawl-orders-*.log): /orders as all 5 roles — Export (CSV), Add Order, Edit order, Record receipt, Sales return modals open/close; 0 page errors.
Writes (orders-w1..w6.log), checked in the DB: O187 (A), O188 (B), O189 (C) created by Sales Manager; O190/O191 backorders.
Works:
- Empty form blocked; Save Order double-click -> 1 order; value auto-priced (₹90/unit MRP).
- Stage owners enforced with clear messages: Dispatch -> Ready refused ("Only Warehouse Manager"), Processing -> Shipped refused (one step), Warehouse -> Shipped refused ("Only Dispatch Team"). SM -> Processing, WH -> Ready, Dispatch -> Shipped -> Delivered all saved.
- Delivered: stock 46 -> 44 (stock_movements delivery row), auto-draft invoice ₹180, value/quantity locked with note, cancel refused, Delete hidden.
- Record receipt: evidence required; double-click -> once; "Receipt recorded by staff"; withdraw offered.
- Sales return (Warehouse): quantity required; 1 unit back (stock 45), credit note ₹90, double-click -> one return.
- Cancel Order confirm: "Keep it" keeps Pending; "Cancel order" + Update -> Cancelled.
- Parent delete refused while a backorder is open (070) with a clear toast; backorders then parent deleted.
- Stale edit Admin vs Admin: warning + "Load theirs" reloads the other change; stale value never saved.

Findings
- HIGH  Split double-click makes two backorders. Confirm Split has no in-flight guard: O189 (50) became O189 45 + O190 5 + O191 5 = 55 units, ₹4,950 vs ₹4,500 ordered; the parent links only O191 (splitIntoOrderId), O190 is unlinked. (`Orders.jsx` confirmSplitOrder / DataContext splitOrder.)
- HIGH  (same root as the partner ownerless-orders HIGH) Orders a Sales Manager creates save with assignedTo = NULL: "Assign To" is optional, defaults to blank and lists only salespeople (not the manager). The order then vanishes from the manager's own Orders list (screen filter `canAccessData(o.assignedTo)`); only Admin/Dispatch/Warehouse/Accounts see it. Visible again once Admin assigns it to Sales Exec 1.
- HIGH  (slow saves, more evidence) Admin stale order save showed "Saving…" ~30–35 s before the conflict warning. Normal order saves 0.9–5 s.
- MEDIUM Sales Manager holds Orders "view": the Edit form still offers 12 editable fields (customer, qty, value, address, Assign To, date…), and a save is refused ("Your role can view orders but not change them") with the message at the top of the scrolled form, out of view (toast also shown). In the stale test this looked like a save that did nothing. Yet the same role can Add Order.
- MEDIUM (owner decision) Dispatch can delete orders that aren't delivered: it deleted cancelled O188 and Pending/Processing O189–O191. Delete order is shown to all 5 roles (Warehouse/Accounts delete not tried). Confirm who should delete orders.
- MEDIUM Same audit-event gap: Warehouse sales return -> 403 on POST /events.
- LOW  React warning "`value` prop on select should not be null" when opening Edit on an order with no assignee (Admin, Dispatch, Warehouse, Accounts).
- LOW  (question) After a ₹90 credit note on an unpaid ₹180 invoice, the invoice status is "Partially Paid" though nothing was paid.
- NOTE  Sales Manager's first sign-in in 3 runs logged ERR_CONNECTION_CLOSED on 4 start-up requests; the page loaded and worked. Network blip.
- Not covered: partial delivery, withdraw receipt, Accounts/Warehouse delete, CSV content.
Cleanup: O188–O191 deleted through the app (DB confirmed). O187 (delivered, invoice INV-1791002006276, return SR-1791002137418, credit note CN-SR-1791002137418, stock movements 53/54) kept as a known test row, like O140/O145 (delete guards; owner's choice). TEST Unrated Balm stock 45 (was 46).

## Group 5: Purchases + Inventory (2026-10-03) — Purchase Manager, Warehouse, Accounts, Admin
Read-only (crawl-purch-*.log): /purchases (4 tabs, status chips, Export) and /inventory (filters, Export CSV, Add Batch) for all 4 roles; 0 page errors. Warehouse and Accounts: view only on Purchases (no Create PO, GRN, vendor edit); Accounts has no Inventory buttons.
Writes (purch-w1..w5.log), checked in the DB and audit_log:
Works:
- Vendor: empty name blocked; Add double-click -> 1 vendor; edit saved.
- PO: no vendor blocked; Create double-click -> 1 PO (PO-12); Confirm; Cancel with reason ("Keep it" keeps it; note "Cancelled on …: Duplicate order"); Draft/Cancelled PO deleted.
- GRN: over-receipt refused by the database with a clear message (browser max switched off to test); partial GRN 4 (batch + expiry, double-click -> 1 GRN) -> Partially Received; second GRN prefilled with the outstanding 6, "no expiry" warning -> GRN Done -> Close. Each GRN its own batch row; vendor payable +₹200/+₹300.
- Delete a PO with receipts refused (068) with a clear toast.
- Vendor payment ₹100: double-click -> 1 payment; payable 500 -> 400.
- Purchase return: double-click -> 1 return; withdraw puts money back.
- Inventory (Warehouse): Add Batch, Adjust, Cycle Count (up, down, from 0), Transfer (splits the batch into the other warehouse), Edit, Delete all saved.

Findings
- HIGH  Purchase return is not checked against stock, and withdrawing it creates stock. A 100,000-unit return of TEST Unrated Balm was accepted (₹50,00,000 credit; nothing checks it against what that vendor supplied or what is held). The stock change is done in the browser (`adjustStock`, which stops at zero), so it took only the 4 units held; "Withdraw" then put back the full 100,000. Audit trail on batch TEST-P3-B2: 6 -> 4 -> 0 -> 100,000 -> 100,002. The vendor payable also briefly went far below zero. (DataContext addPurchaseReturn/deletePurchaseReturn.) Cleaned: B2 put back to 6 by Cycle Count.
- MEDIUM "Withdraw this payment" never appears: ledger rows have id `vpay-VPAY-…` (`utils/distributorUtils.js` buildVendorLedger) but the screen checks `startsWith('VPAY-')` (`Purchases.jsx:883`), and the handler would send the prefixed id. A wrong vendor payment can't be withdrawn in the app.
- MEDIUM Master lists are readable only with Settings view (`masters_select` = can_view('settings')). Other roles fall back to the built-in defaults: Purchase Manager/Warehouse/Accounts have no "Partially Received" chip, though PO-12 sat in that status. Any Master Lists change (labels, colours, new options) is invisible to them. Probably affects other lists (order status, expense categories); not checked yet.
- MEDIUM Vendor delete fails silently: with a payment on file the delete gets a 409 (FK fk_vendor_payments_vendorid). No message is shown, the vendor vanishes from the list until reload, and the console says "will be lost on refresh".
- MEDIUM Stock adjustments are silent and absolute: Adjust −100 on 7 units -> 0 with no warning. Inventory writes send an absolute quantity worked out in the browser ({"quantity":5}), so two people adjusting the same batch at once overwrite each other. GRNs and purchase returns write no stock_movements rows (that ledger covers sales only).
- LOW  PO with no unit cost saves as ₹0 (PO-13), and the line is not required.
- LOW  PO/vendor/payment/return/adjust/count/transfer saves are fire-and-forget (modal closes at once, no success or failure toast). The double-click lands on whatever is behind: the payment form reopened, and a PO detail panel opened.
- LOW  Vendor ledger matches GRNs to a vendor by name, not id (renaming a vendor would drop its GRN history).
- LOW  GRN line receivedQty stored as text "4" in GRN-20 and as the number 6 in GRN-21.
- MEDIUM Same audit-event gap: Purchase Manager and Warehouse saves -> 403 on POST /events.
- QUESTION Warehouse Manager can't record a GRN (Purchases view only), though it physically receives goods. Intended?
- NOTE  One cycle count (B9, 0 -> 5) and one PO save (PO3) didn't reach the DB in the first runs; neither reproduced in isolated reruns (count up/down/from 0 and PO-14 all saved). Most likely script timing, but these saves are fire-and-forget, so a lost save would look exactly like this.
- NOTE  ERR_CONNECTION_CLOSED on start-up requests at sign-in when several browsers log in at once; pages loaded fine.
Cleanup: PO-13/PO-14, return rows, test batches B7/B8/B9 deleted; B2 put back to 6. Left as known test rows (owner rule: don't bypass guards): TEST-P3 Vendor (V1791003129329, payable ₹400), PO-12 (Closed; delete refused, 068), GRN-20/GRN-21, batches TEST-P3-B1 (4) and TEST-P3-B2 (6), payment VPAY-1791003520268 ₹100 (can't be withdrawn in the app, see finding; vendor delete blocked by its FK). DB vs baseline: POs 18->19, GRN 25->27, vendor payments 16->17, vendors 3->4, inventory rows 27->29, vendor payables ₹1,49,360 -> ₹1,49,760 (+400); purchase returns 3, stock_movements 50, expenses 15 unchanged.
