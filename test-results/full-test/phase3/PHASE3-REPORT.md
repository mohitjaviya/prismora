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

## Group 6: Accounting (2026-10-03) — Accounts, Director, Admin (+ Sales Manager, Warehouse, Dispatch, Distributor as outsiders)
Accounting access in the DB: Accounts, Admin, Director, Super Admin, all `full` (no role has `view`, so the view-only screen was not reachable).
Read-only (crawl-acc-*.log, acc-probe.log): /accounting (Overview, Invoices, Expenses, Credit Notes, Balance check), /reports (all categories, Financial sub-reports) for Accounts, Director, Admin; 0 page errors. Sales Manager and Warehouse are sent to /?denied=1 from /accounting and /ledger. Balance check "All balances match" for Accounts and Director.
Writes as TEST Accounts (acc-w1, acc-w1b, acc-w2 logs), each step read back from the DB as the same signed-in user; role rules checked by a rolled-back dry run (acc-dryrun.log, acc-dryrun2.log, 23 + 7 scenarios, nothing kept).
Works:
- Log Expense: zero amount blocked with a message; double-click -> 1 expense; delete asks, Cancel keeps it, Delete removes it (DB).
- Custom invoice: empty form, missing GST rate refused with clear messages; partner picks fill name + state; preview ₹1,000 + 18% = ₹1,180; double-click -> 1 invoice, CGST/SGST 90/90, partner balance +1,180.
- Mark as Paid: confirm (Cancel changes nothing); double-click -> 1 payment, balance to 0; Mark unpaid removes the payment and restores the balance.
- Credit note against an invoice: double-click -> 1 note; withdraw puts the balance and invoice status back exactly (−3,920 -> 1,080 -> 1,180, Settled -> Partially Paid -> Unpaid).
- Invoice filters, Proforma filter (22), print preview, WhatsApp/e-mail reminders open; 5 Financial reports load and export CSV (TDS empty, H17).
- RLS: Sales Manager, Dispatch and Distributor cannot read expenses/other partners' invoices, nor write expenses, credit notes, payments or invoice status. Director can log an expense. A hand-set "Settled" is overridden by the status trigger. Accounts cannot write a partner balance directly.

Findings
- HIGH  Credit notes have no upper limit, and they settle invoices. Through the app: a ₹5,000 credit note on a ₹1,180 invoice was accepted; the invoice turned "Settled" (amountPaid 1,180, no payment) and the partner went to −₹3,920 (₹3,920 credit they never paid for). In the DB (rolled back): a ₹9,99,999 note took D-TEST-1 to −₹10,61,355. Nothing compares the note with the invoice it is against, or with what is still due. The screen prefills the invoice total but allows any amount.
- HIGH  Issued GST tax invoices can be changed or deleted. Through the app: a paid tax invoice was deleted after a bare "Delete this invoice?" confirm; its ₹1,180 payment record was deleted with it, so the money received disappears from the books and the invoice number leaves a gap. The only thing that blocks a delete is an attached credit note (a foreign key, not a rule). In the DB (rolled back): Accounts changed an issued tax invoice's amount from ₹1,700 to ₹1; tax/CGST stayed at ₹270/₹135, amountPaid was recomputed to 271, and the partner balance did not move, so the balance check would now drift. A tax invoice should be corrected with a credit note, not edited or deleted.
- MEDIUM Negative amounts are accepted by the DB: expense −₹500, partner payment −₹500 and credit note −₹500 (the last two raise the partner's balance like a charge). The screens block ≤0, but the database does not.
- MEDIUM Reminders go to placeholder contacts. When no phone/e-mail is found (looked up by customer name), WhatsApp opens to 9876543210 and e-mail to accounts@prismora.com (`Accounting.jsx:437-438`). Seen live: TEST B5 invoice -> wa.me 919876543210. A real stranger could get the customer's invoice details.
- MEDIUM A manual credit note for a name that matches no partner ("TEST-P3 Nobody", ₹10) is accepted. It lowers net sales (credit notes ex-GST come off), but nobody's account moves. A typo in a name gives an unexplained cut in sales. The message does say "No partner matched".
- LOW  Log Expense, expense delete and Mark unpaid don't wait for the save: the modal closes at once and there is no success or failure message (`handleAddExpenseSubmit` ignores the result of `addExpense`; delete and Mark unpaid ignore theirs). Same pattern as G5.
- LOW  Future-dated expense (30 Jun 2027) accepted without a warning.
- LOW  Convert's confirm says "the partner is charged it" even when the customer is not a partner (INV-1791002006276, TEST-P3 Ord A).
- NOTE Log Expense offers a fixed list (Raw Materials, Logistics, Marketing, Salaries, Rent, Other), not the master list `expense_category` (Travel, Fuel, …). This ties in with H17 (TDS).
- NOTE A real (non-TEST) Sales Manager account approved two field expenses (₹1,000 + ₹900, Ankita) at 05:23 UTC during the run, so global totals moved on their own. Checks used TEST rows only.
Not tested on purpose: Convert (permanent; the only proformas are real ones and O187's kept invoice; confirm opened and cancelled). Bill CRM Order (offers 64 uninvoiced orders, real ones included). "Book them" (not shown; no missing payouts). Super Admin (same permissions as Admin; G7).
Cleanup: TEST B1 Distributor invoice INV-1791005442751, its payment, credit notes CN-1791005461387/472021/483309 and expenses EXP-2/EXP-3 all removed through the app; DB after: no TEST-P3 G6 rows, B1 balance 0, invoices 74, credit notes 18, partner total −₹57,015.20 (same as at the start); audit_log has every step under TEST Accounts.

## Group 7: Admin (2026-10-03) — Super Admin, Admin, Director, Customer Support (+ Sales Exec 1, Distributor as outsiders)
Screens: Master Lists, Team Members, Product Catalogue, Roles & Permissions, Settings (Audit Log, Activity, Company, Change Password), Profile, Distributors, Dealers, Retailers, Schemes, Complaints (staff side), AI Insights, ML Lab.
Read-only (crawl-adm-*.log): all 14 screens for Super Admin, Admin, Director; Complaints/Customers/Leads/Orders/Schemes/Profile for Customer Support. All exports download, every modal opens and closes, 0 page errors. Director is sent to /?denied=1 from all /masters pages; on Settings it gets all 4 tabs, with Company read-only (inputs disabled).
Writes as TEST Admin (adm-w1..w7 logs), each step read back from the DB; DB rules as the real roles in a rolled-back dry run (adm-dryrun.log, 22 scenarios, nothing kept).
Works:
- Team Members: blank form blocked; weak/short password refused on screen; bad and duplicate e-mail refused by create-user with a clear message; create (double-click -> 1 user, signs in), e-mail shown read-only on Edit, name edit, Deactivate (confirm; the account then reads nothing), Reactivate, Delete (Cancel keeps; Delete removes the profile and the login).
- Master Lists: whitespace can't be added; duplicate key refused ("exhibition" is already in this list); add (double-click -> 1), switch off/on, move up/down, empty label refused ("An option needs a name"), remove.
- Products: blank blocked; negative price stopped by the browser; create (double-click -> 1), edit, delete with confirm (Cancel keeps).
- Partners: Distributor -> Dealer -> Retailer chain created (double-click -> 1 each), edit, delete with confirm; deleting a distributor that still has a dealer is blocked with a clear explanation.
- Schemes: create (double-click -> 1), edit, Activate/Deactivate, delete with confirm. Complaints: register (double-click -> 1; Gujarati, Hindi and HTML text saved and shown as typed), resolve requires notes, audit rows under TEST Admin.
- Roles: Admin on the Super Admin card has no permission buttons, and a Level click is refused by the DB ("Only a Super Admin can change the Super Admin role"); Admin can't take Settings from its own role (screen and DB). Customer Support Geography none -> view reached that user on the next page load (/geography opened), reverted -> denied again; both changes in audit_log under TEST Admin.
- Settings: Audit Log filters by person and search work (today's G7 rows listed); Company refuses a bad GSTIN with a clear message, saving unchanged values changes only updatedAt. Change Password (Settings and Profile): mismatch, short, letters-only, wrong current password all refused with clear messages; a real change on TEST Customer Support worked (new one signs in, old one refused) and was reverted.
- DB (dry run): Sales Manager can't add master options or edit roles; Director can't edit company details or add products; Sales Exec can't create schemes; Customer Support can't change prices; partners can't raise their credit limit, change their parent, read other users or file complaints for another partner; Admin can't write a partner balance or take Settings from its own role.

Findings
- HIGH  Admin can make any role an admin. `roles` UPDATE lets an Admin set `settings = full` on another role (dry run A10: Director role, 1 row; the same works for any role). Settings full = user management, so every holder of that role becomes an admin, which side-steps the 071 rule that only a Super Admin grants admin roles. The screen allows it too (setAccess only stops changes to one's own role).
- MEDIUM Products are linked by name, with no foreign key. Inventory batches (`inventory.product`), orders (`product`/`items`) and scheme targets (`applicableProducts`) store the product's name; nothing references `products.id` (0 foreign keys). The DB lets an Admin delete a product in use (dry run A4: TEST Unrated Balm, 3 batches and 2 orders, deleted), and a rename would detach its stock, orders and schemes in the same way (rename not run).
- MEDIUM Complaint Delete does nothing in the database. `complaints` has no DELETE policy, so the delete matches 0 rows (Admin and Customer Support, dry run A1/A2). The screen removes the card at once with no message; it returns after a reload. CMP-5 (TEST-P3 G7 Customer, Resolved) could not be removed and is kept.
- MEDIUM Master Lists "Remove" shows a browser box reading "[object Object]". `Masters.jsx:262` calls the browser's own `confirm()` with an object; the app's `useConfirm` is not imported. OK removes the option, so it works, but the question is unreadable. Only this screen does it.
- MEDIUM Partner forms check no formats: GSTIN "abc", phone "abc", pincode "123", e-mail "x@y" saved as typed with the browser checks on (Distributors; Dealers and Retailers use the same form). The GSTIN prints on tax invoices. The DB also takes a negative credit limit (−500 saved with the browser check off; dry run A8).
- MEDIUM The DB has no value rules on master data. Saved through the screen with browser checks off, and confirmed in the dry run: product price −5, HSN "abc", partner prices above MRP (₹500 on a ₹10 MRP; this one with browser checks on); scheme discount 150 %, a scheme that ends before it starts, a Flat Discount of 0 %; master key "WEBSITE" beside "Website" (the live Lead Sources already hold "Other" and "other"). Renaming an option's label to an existing one is allowed (two "Website" entries shown).
- MEDIUM (confirms G5) Master lists are invisible without Settings view: Sales Exec 1 reads 0 `masters` rows, and its Add Lead form offers the built-in sources (no "meta-ads"; options an admin adds never appear).
- MEDIUM Profile "Revenue Generated" and "This month's revenue" add up every order's value, cancelled ones included (`Profile.jsx:33`; Admin sees ₹2,96,315). The Phase 2 H decision says revenue means Accounting's net sales; this screen was missed when order-value figures were relabelled.
- LOW  Creating a product with a name already in the catalogue does nothing: the form closes as if saved, no message (`DataContext.jsx:2076` returns quietly).
- LOW  Product, partner and scheme saves give no success or failure message (form closes at once). Same pattern as G5/G6.
- LOW  Team Members: when create-user refuses (bad or taken e-mail) the form has already closed, so everything must be retyped. A successful create took about 9 s.
- LOW  A dealer or retailer gets no territory from its parent (territoryId null even under a distributor in Demo Gujarat). This feeds the ownerless portal-orders HIGH.
- LOW  The Level buttons on the Super Admin card stay clickable for an Admin (`Roles.jsx:423`); the DB refuses with a clear message.
- LOW  The password rule is only on the screen: Supabase Auth accepted "abcdef" through the API (reverted at once).
- LOW  AI Insights: React duplicate-key warning; the churn list is keyed by customer name and "Krishna pharma" appears twice.
- NOTE Price List shows every product whatever its status, though the subtitle says "all active products" (code read). A new product was readable by the Distributor (API); the screen pages by name, so it sat past page 1.
- NOTE The Customer Support Geography revert took over 4 s to land (the first read-back still showed "view"; the DB had "none" moments later). Another sign of the slow-saves item.
Not tested on purpose: Super Admin writes (same screens as Admin; its extra rights were covered in Phase 2 G and batch 7); approving a pending partner (no pending TEST registration; known LOW: no confirm); the Company save with new values (real invoice seller details); deleting a product with real orders (dry run only).
Cleanup: all TEST-P3 G7 users, options, products, partners and schemes deleted through the app (3 stray rows from refusal tests deleted via the API as TEST Admin); Lead Sources back to 13 rows in the original order; Customer Support permissions identical to the start; TEST Customer Support password restored and checked; company_settings changed only in updatedAt. Kept: CMP-5 (app can't delete it, see finding).

---

# Phase 3 summary (final, 2026-10-03)

All 7 groups swept: SFA, Partner, Sales, Orders, Purchases + Inventory, Accounting, Admin. 16 roles signed in as themselves; every save was checked in the database, not on the screen; role rules were checked by rolled-back dry runs (G6: 30 scenarios, G7: 22). No page crashed and no screen went blank. No CRITICAL finding is open.
Not covered in Phase 3: the layout/theme matrix (P3-35: 768/375 px, light/dark), Login/Register/shell (P3-01..03), date-range filters on Reports. These carry over to Phase 4 or a later pass.

## All findings, ranked
HIGH (7)
1. G5 Purchase return not checked against stock or what the vendor supplied; Withdraw creates stock (100,000 units, ₹50,00,000 credit accepted). Stock is moved in the browser.
2. G2/G4 Ownerless orders: partner portal orders (partners can't read `territories`) and a Sales Manager's own orders (Assign To blank) save with no owner, so the manager can't see them to move Pending -> Processing. Owner: top priority.
3. G4 Split into Backorder double-click makes two backorders (55 units from 50).
4. G6 Credit notes have no limit and settle invoices (₹5,000 note on ₹1,180 -> "Settled", partner in credit ₹3,920).
5. G6 Issued tax invoices can be edited or deleted (a paid invoice and its payment deleted; amount editable while tax stays).
6. G7 Admin can give any role Settings = full, making all its holders admins (side-steps the 071 rule).
7. Open item, more evidence in G3/G4/G7: slow saves (stale-edit 7–35 s; create user 9 s; role revert > 4 s).

MEDIUM (19)
- Audit-event gap: `events` insert needs 'reports', so Sales Exec, partner, Warehouse and Purchase Manager saves log nothing there (G1–G5).
- Master lists readable only with Settings view; other roles get built-in lists (G5, G7).
- Products linked by name with no foreign key; an in-use product can be deleted or renamed (G7).
- No value rules in the DB: negative expense/payment/credit note (G6); negative price, HSN "abc", prices above MRP, 150 % discount, backwards dates, negative credit limit, case-duplicate option keys (G7).
- Partner forms check no GSTIN/phone/pincode/e-mail format (G7).
- Complaint Delete does nothing in the DB (no DELETE policy) and says nothing (G7).
- Master Lists Remove asks "[object Object]" (G7).
- Reminders fall back to 9876543210 / accounts@prismora.com (G6).
- Manual credit note for a name that matches no partner lowers net sales (G6).
- Vendor payment "Withdraw" never appears (id prefix mismatch) (G5).
- Vendor delete with a payment fails silently (G5).
- Stock adjustments clamp silently to 0 and write absolute quantities from the browser; GRNs and purchase returns write no stock_movements (G5).
- Sales Manager (Orders view) gets a fully editable Edit form; refusal shown out of view (G4).
- Profile revenue = all order values, cancelled included (G7).
- Owner decision: Dispatch can delete undelivered orders (G4).
- Question: Warehouse Manager can't record a GRN (G5).
- (Carried, already open) self-registered partner has no address/territory; claims not tied to earned incentives.

LOW (about 20): fire-and-forget saves with no message (G1, G5, G6, G7); Export on an empty list uses a browser alert; complaint double-click 409; Team form lost on server refusal; duplicate product name silently ignored; dealer/retailer get no territory from parent; Super Admin Level buttons clickable; password rule only on screen; React warnings (null select value, duplicate key); invoice "Partially Paid" after a credit note only; PO line at ₹0; vendor ledger matched by name; GRN receivedQty text vs number; future-dated expense; Convert wording; Price List shows inactive products; PO cancel note dated in UTC.

## Suggested fix batch order
Each batch: dry run first (migration inside a rolled-back transaction, scenarios as the real roles), then apply, then check as the real roles locally and live, and confirm in the DB.
1. Batch 9 — money and stock integrity (DB first): purchase return checked against stock held and quantity received from that vendor, with the stock move done in the DB (and the reverse on withdraw); credit note capped at what is still due on its invoice; issued tax invoices locked (amount, tax, delete), corrections by credit note only; CHECK amount > 0 on expenses, payments, credit notes, vendor payments.
2. Batch 10 — order ownership and flow: assignee/territory for portal orders worked out in the DB (trigger) instead of the browser; Sales Manager orders default to the manager (or require an assignee); dealers/retailers inherit the parent's territory; in-flight guard on Confirm Split plus a DB check that a parent has one open backorder per split.
3. Batch 11 — permissions and audit: only a Super Admin may set Settings = full on any role (DB guard, screen mirrors it); `masters` readable by every signed-in staff role; `events` insert allowed for every signed-in user (own actor only), closing the audit gap; complaints DELETE policy for complaints = full (or hide Delete), with the result shown.
4. Batch 12 — master-data rules: CHECK constraints for product prices (≥ 0, partner price ≤ MRP), scheme discount 0–100 and validFrom ≤ validTo, credit limit ≥ 0, unique lower(key) per master list (clean "Other"/"other" first); block delete/rename of a product that stock, orders or schemes use (or move those links to product id); GSTIN/phone/pincode format checks in the partner forms and DB.
5. Batch 13 — screen feedback (front-end only): await every save and show success/failure (Beat, Claim, Punch, PO, vendor, payments, returns, stock, expenses, products, partners, schemes); fix vendor-payment Withdraw id; vendor delete message; Masters confirm via useConfirm; Team form stays open on refusal; duplicate-product message; read-only Edit for view roles; Profile revenue relabelled to Orders Booked (excluding cancelled); remove placeholder reminder contacts; the LOW list.
6. Batch 14 — slow saves: add timing to `persist()`/`journaled()` and the create-user call, reproduce, then fix.
Owner decisions needed before or alongside: who may delete orders (Dispatch?), Warehouse recording GRNs, H17 TDS categories, removing CMP-5 via SQL.
