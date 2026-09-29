# Fix Batch 5: Phase 2 findings

Owner's order: groups 1–4, with approval before each group. Backup skipped by the owner (demo data); the fallback is `backups/2026-09-28T05-34-37-801Z`, which predates migrations 041–060 and Phase 2. Two backup attempts on 2026-09-29 were incomplete (09:00: every table and auth, but no schema or manifest; 09:17: timed out).

## Group 1: order rules in the database (migrations 061, 062; commit 96a31e8; deployed and verified live)

### B10: invoiced orders are locked (061)

- Once any invoice (proforma or tax) names an order, its value, quantity, product and line items are read-only for every signed-in user, Admin included. The refusal names the invoice and points to a sales return or credit note.
- Lines are compared by what was billed (product, quantity, unit price), so the order form resending the same lines with a status change still saves.
- **Screen:** the value, quantity and product fields are disabled on an invoiced order, with "Invoiced as INV-…: value, quantity and items can no longer change…".
- **O113 and O118 are left as they were:** O113 at ₹1 × 1 against INV-1790657046836 (₹2,400 + ₹354); O118 at ₹999 against INV-1790621973293 (₹850 + ₹135). **For you to decide:** correct them (by a maintenance update) or keep them as regression evidence. Every attempt to change them now is refused.

### A09: order stages enforced in the database (062)

- **One step at a time:**
  - Pending → Processing → Ready for Dispatch → Shipped → Delivered.
  - Shipped → Partially Delivered → Delivered.
  - Cancelled before delivery.
  - No skipping, no going back, no reviving a cancelled order.
- **Each step by its owner (the same table as the screen):**
  - Processing: the sales roles.
  - Ready for Dispatch: the Warehouse Manager.
  - Shipped and Delivered: the Dispatch Team.
  - Cancelled: the sales roles, or a partner for its own order.
  - Admin and Super Admin may take any single step, but not skip one.
- **Address and pincode** are required from Processing on, and can't be cleared later.
- **New orders start at Pending.** A split's backorder starts at Processing, as the app already did.
- **Screen:** only the next step is offered (later steps dimmed, with the database's own sentence if clicked). Partial Delivery is offered only after Shipped. A new order's status is fixed at Pending.
- **Refusal messages:** a refused order save now shows the database's reason instead of "The change could not be saved.", and the row goes back to what it was.

**Process change to note:** partner orders used to be taken by the Warehouse straight from Pending to Ready for Dispatch. They now need the Processing step first, done by a sales role (the Sales Manager for the team's partners) or an Admin.

### Tests

**Database, each role on its own login: 8/8** (`fix-batch-5/g1-api-live.json`)

| Test | Attempt | Result |
|---|---|---|
| G1-B10-01 | Admin changes O118's value, O113's quantity/value, delivered O117's items; Dispatch changes O118's value | All 403 with the invoice named. Rows unchanged. |
| G1-B10-02 | Fresh O126 | Value change allowed before any invoice. After Accounts billed it ahead (INV-1790687111466), value and items were refused. Moving it to Processing with the same lines resent (other key order, extra keys) saved. |
| G1-A09-01 | O126 | Warehouse → Shipped (skip): refused. Admin → Delivered (skip): refused. Warehouse → Ready for Dispatch: ok. Warehouse → Shipped (not owner): refused. Admin back to Processing: refused. Admin clears the address: refused. Dispatch → Shipped → Delivered: ok, stock −1, no second invoice. |
| G1-A09-02 | Inserts | Admin inserting as Delivered or as Processing: refused. As Pending: ok. Warehouse inserting as Shipped: refused. |
| G1-A09-03 | O128 without an address | Admin → Processing and SE1 "send to warehouse": both refused. Once the address was added, SE1's send worked. |
| G1-A09-04 | O127 | Warehouse cancel: refused. SE1 cancel: ok. Admin reviving to Pending or Processing: refused. |
| G1-A09-05 | Distributor | Moving its own order to Processing: no change. Cancelling its own Pending order (O129): ok. |
| G1-DB | Balance check | All balances match. |

**Screen: 4/4 locally and 5/5 on live** (`fix-batch-5/g1-screen-*.json`; screenshots in `screenshots/fix-batch-5-*`)

| Test | Role | Result |
|---|---|---|
| G1-S-01 | Warehouse | Shipped, Delivered and the dropdown → Shipped each show "Order O130 is Processing; the next step is Ready for Dispatch…". Later steps are dimmed; the DB is unchanged. |
| G1-S-02 | Admin | Delivered refused with the same sentence. Ready for Dispatch + Update saved. |
| G1-S-03 | Admin | O118's value and quantity are disabled, with the invoice note. With the field forced open, Update shows "Order O118 has been invoiced (INV-1790621973293)…" and the DB is unchanged. |
| G1-S-04 | Admin | Add Order: status fixed at Pending. |
| G1-S-05 (live) | Dispatch | Normal path on screen: O130 Shipped → Delivered, stock −1, proforma INV-1790687900007, balances match. |

**Checks:** 727 unit tests pass (6 new). Build clean. Lint: no new problems (DataContext keeps its 28 older ones).

**Test data:** O126 (delivered, billed ahead), O127 (cancelled), O128 (Ready for Dispatch), O129 (cancelled, D-TEST-1), O130 (delivered), INV-1790687111466, INV-1790687900007.

### Group 1 follow-up: invoiced orders can't be cancelled or deleted; O113/O118 corrected (migration 063; commit c35de96; deployed and verified live)

Owner's decisions:
1. Correct O113 and O118.
2. Keep the new Processing step for partner orders.
3. Close both gaps.

- **Cancel and delete:** an order named by any invoice can't move to Cancelled and can't be deleted, by any signed-in user, Admin included. The refusal names the invoice and points to a credit note (or a sales return for delivered goods). The order screen refuses a cancel before saving, in the same words.
- **O113 and O118 corrected** by an audited maintenance update (actor "System", via "maintenance correction: Phase 2 test artifact from the B10 fix verification — value/quantity restored to the invoice"):
  - O113: ₹1 × 1 → ₹2,400 × 20.
  - O118: ₹999 → ₹850.
  - Their lines were never changed. Balances are unaffected.

**Tests:**

| Test | Where | Result |
|---|---|---|
| G1-063-01 | Database | O131 (Pending, billed ahead as INV-1790691847236): Admin cancel refused (063); SE1 cancel refused (046's "Accounts must reverse the invoice first"). Admin, Warehouse and Dispatch DELETE refused. Admin DELETE of delivered O126 refused. O131 still Pending. |
| G1-063-02 | Database | Controls: uninvoiced O132 cancelled and uninvoiced O133 deleted by Admin, both fine. |
| G1-S-06 | Screen, local and live | Admin dropdown → Cancelled, Admin row Delete + confirm, and SE1 Cancel Order each show the refusal naming INV-1790691847236. The DB is unchanged. |

Balance check: all balances match.

## Group 2: save reliability and vendor balances (migrations 064, 065; commit 67f2e0d; deployed and verified live)

### B07: a save never vanishes silently

**Cause, found while testing.** When a page is left mid-save, Chrome shows "Leave site?" and, if the person leaves, aborts the in-flight request *before* `pagehide`. The app then recorded that save as a finished failure on the dying page, so nothing was left for the next page to report. The earlier journal (042) only caught saves still pending at unload. Proven with the save request held in the browser: the lead never reached the server, and nothing told the person.

**What changed:**
- **Leads (064):** numbered by the database. A new lead is one request instead of guess → clash → ask → retry.
- **Journal:** every create is journaled with a readable label (new lead, order, expense, expense claim, vendor payment).
  - While a save is in flight, closing or reloading the page brings up the browser's "Leave site?".
  - At that moment, what is still saving is recorded. A request aborted while leaving counts as "outcome unknown", not a failure.
  - If the person stays, the record is dropped once the saves finish.
- **SaveGuard banner:** on the next page, "A save may not have finished … Check it is there, and enter it again if not", naming each one. The journal's `abandoned` report in `client_write_log` works again too.
- **Failures after leaving:** a save that fails after its page was left is announced where the person is now.

### B09: stale form warning (leads and orders)

- A lead or order edit saves only if the record still has the `updatedAt` stamp the form opened with.
- If someone saved in between, a dialog names them and the fields they changed ("TEST Sales Manager saved this lead at … — Notes: "…" → "…""), with **Load theirs** (the form reloads their version; nothing written) or **Overwrite with mine**.

### Vendor balances in the database (065)

- **Moves with its record:** the payable moves in the same transaction as the goods receipt (+ quantity × unit cost), purchase return (− value) or vendor payment (− amount), and back if one is withdrawn or changed. The browser no longer writes it.
- **Direct writes refused** for every app user, Admin included.
- **`vendor_balance_drift()`**, shown in Accounting's **Balance check** next to the partners.
- **Two older vendors drift. Not corrected; for your decision:**

| Vendor | Stored | From its records | Difference | Notes |
|---|---|---|---|---|
| TEST-V-1 TEST Herbal Raw Materials Co | ₹1,000 | ₹4,839 | −₹3,839 | |
| V1790054615576 Janki Herbal Private Limited | ₹1,11,500 | ₹1,21,500 | −₹10,000 | Includes GRN-17 (₹1,10,000, no PO, matched by vendor name, not entered by my tests). GRN-1/GRN-2 name "janki herbals", which matches no vendor, so they count for nobody. |

### Tests

**Database** (`fix-batch-5/g2-api-live.json`):

| Test | Result |
|---|---|
| G2-V-01 | Accounts sees the two drifting vendors; the clean P2 vendor isn't listed. Purchase Manager and Warehouse (Purchases view) see the same; others see none. |
| G2-V-02 | PM and Admin writing a vendor balance directly: refused ("moves only with its goods receipts, purchase returns and payments"). A contact edit still saves. |
| G2-V-03 | PM payment ₹100 → −100, withdrawn → +100; return ₹50 → −50, withdrawn → +50; goods receipt 2 × ₹40 → +80. Each moved exactly once, audited "TEST Purchase Manager via vendor payment/purchase return/goods receipt …". |

**Browser, local and live** (`fix-batch-5/g2-screen-*.json`):

| Test | Scenario | Result |
|---|---|---|
| G2-B07-01 | Save, then reload; the person chooses Stay | Lead saved |
| G2-B07-02…05 | Lead, order, expense and vendor payment: Save, reload, leave anyway | Each saved (the single request had gone), vendor balance moved once |
| G2-B07-06 | Worst case: save request held in the browser, reload, Leave | Next page lists "New lead "TEST B5 held lead …""; DB has no row (really unsaved, and the person is told); `client_write_log` has the `abandoned` row. Local and live. |
| G2-B07-08 | Held request, Stay, request released | Saved, and no false banner later |
| G2-B07-07 | Offline | "The lead could not be saved.", form stays open, nothing written. Local and live. |
| G2-B09-01 | Load theirs | Both the SM's note and the rep's phone end up saved |
| G2-B09-02 | Overwrite with mine | The rep's version saved, by choice |
| G2-B09-03 | Order | Admin warned that Warehouse changed the delivery address; Load theirs keeps it |
| G2-V-04 (live) | Accounting's Balance check | "2 vendor balances differ from goods receipts − returns − payments", listing both |
| Group 1 again (live) | O135 | Warehouse and Admin skip refusals, invoiced lock, new order at Pending, Dispatch Shipped → Delivered all pass through the new conditional save |

**Checks:** 731 unit tests pass (new: staleEdit, journal abandoned-to-person). Build clean. Lint: no new problems.

**Small follow-up:** the Balance check footer says to use "Correct balance" on the Ledger, which exists for partners only; no vendor correction tool exists yet.

**Test data:** leads L15–L23 and "TEST B5 …" leads; orders O134, O135; expense EXP-1; vendor payment VPAY-1790695226985 (₹42); TEST-PO-B5 / TEST-GRN-B5 (vendor +₹80). The vendor is at ₹1,038, which equals its records.

## Group 3: slow saves (investigated; cause not reproduced, so not "fixed")

**What was measured on the current build (live):**
- Vendor payments and a proforma conversion, fresh sign-in, straight to the save, repeated: 0.34–0.9 s from click to confirmed.
- The request leaves the browser 10–36 ms after the click. The server answers in 0.3–0.6 s. No main-thread stalls around the click.
- The same with database polling running alongside (a hypothesis: my test scripts' CLI calls): no change. Ruled out.
- An auth-lock deadlock in the sign-in handler (a known supabase-js trap) is ruled out: the handler already defers its database call.

**What the app's own log shows (`client_write_log`, kind `slow`):**
- All 25 slow saves ever logged happened **4–26 s after sign-in**, taking 5–41 s.
- They still occur occasionally on the current build: a lead save of 8.2 s in the stale-tab test, and a vendor payment that hadn't landed 4 s after its click.

**Not established:** whether, in a slow case, the request leaves late (browser) or is answered late (network or platform). The captures that would show it were never taken during a slow one. The server's own query times stay under 0.2 s, and the per-request timing I added to the test driver has only ever seen fast saves.

**Why this is no longer data-losing:** since Group 2, a slow save can't vanish silently. Leaving asks first, and if the person leaves anyway the next page lists the save. **Suggested next step, if you want to pursue it:** have the journal record, per save, when its request was sent and when the answer came, so the next slow save in real use shows which half is slow.

## Group 4 (commit b1fe5ec; migrations 066, 067; deployed and verified live)

| Item | Fix | Live test |
|---|---|---|
| 4a double-click guards (B06, A06) | A ref guard on Save Lead, Save/Update Order and Create order holds from the first click. **066:** the database refuses a second order for a lead that already has one not Cancelled. The conversion also asks the database first. | G4-A-01: same-instant double click → 1 lead (L24). G4-A-02: same-instant Create order → 1 order (O136). A stale tab trying again is stopped by "Someone else changed this lead — Status: Negotiation → First Order", and a direct second insert → 409 "Lead L25 has already been converted to order O137". G4-A-03: same-instant Save Order → 1 order (O138). |
| 4b confirmations | Mark as Paid ("Mark INV-… as paid? This records a payment of ₹… from … and settles the invoice") and Cancel Order ("Cancel order O…? … It cannot be revived afterwards", with Keep it / Cancel order) | G4-B-01: Cancel → still Unpaid; confirm → Settled. G4-B-02: Keep it → order stays Pending. |
| 4c vendor ledger pop-up | The header reads the live vendor, so it follows a payment or return at once. Same-day entries are ordered by when they were recorded. | G4-C-01: ₹5 payment → header ₹1,026 → ₹1,021 without reopening, matching the DB. |
| 4d vendor Correct balance | **067** `correct_vendor_balance()` (Accounts full or admin, audited "balance corrected to goods receipts − returns − payments"). A "Correct" action on vendor rows in Accounting's Balance check, behind a confirmation. | G4-D-01: PM → 403 "Only Accounts or an administrator can correct a balance". Accounts: a +₹5 drift induced on the P2 test vendor (maintenance, audited "TEST setup…") corrected ₹1,031 → ₹1,026, audited as TEST Accounts. **The two older vendors were not touched.** |

Unit tests: 731 pass. Build clean. Lint: no new problems (the Accounting and Purchases files had 1 and 5 older ones).

**Still visible:** the vendor pop-up's per-row running "Bal:" matches receipts to a vendor by exact name only, so it can differ from the header. For example, TEST-GRN-B5 was named without the vendor's number suffix. The header, the database and the Balance check agree with each other.

## GRN-17: what happened (read-only; nothing corrected)

From the audit log:

| Time (29 Sept) | Who | What |
|---|---|---|
| 14:00:34 IST | **Admin User** (id 1, role Admin: the real admin login, not a TEST account) | Created **PO-10** for Janki Herbal Private Limited, "testing purchase": 1,000 × Aloevera Skin Gel @ ₹100 + 100 × Tulsi Cough Syrup @ ₹100 = ₹1,10,000 |
| 14:00:46 | Admin User | PO-10 Draft → Confirmed |
| 14:01:23 | Admin User | **GRN-17** received against PO-10 (all 1,000 + 100). Stock batches created: Aloevera "abc765", expiry 29 Sept 2026 (so already expired, never sellable), and Tulsi with no batch number. PO-10 → GRN Done. |
| 14:01:25 | Admin User's browser (old code, separate write) | Janki's balance ₹11,500 → **₹1,11,500 (+₹1,00,000 only, not ₹1,10,000)** |
| 14:02:34 | Admin User | PO-10 → Closed |
| 14:06:47 | Admin User | **PO-10 deleted.** The database then set GRN-17's `poId` to null, which is why it has no PO. |

**What this means:**
- **The −₹10,000 Janki drift** is this receipt: the old browser-side charge added ₹1,00,000 for a ₹1,10,000 receipt. That's the kind of gap 065 now prevents.
- **A PO with goods receipts can be deleted.** The receipt stays, orphaned, and its stock and payable remain. Worth a rule: refuse deleting a PO that has receipts, or require withdrawing them first.
- The TEST-V-1 drift (−₹3,839) was not investigated here.
- As instructed, neither vendor balance was corrected.

## Wrap-up (migration 068; commit 4ddf4ff; deployed and verified live)

- **068:** a PO with goods receipts can't be deleted (all roles).
  - G5-01: Admin and PM deleting PO-9 / PO-1 → 403 naming the GRN. A receipt-less Draft PO still deletes.
  - G5-02: on screen, the PM gets the refusal and PO-9 stays.
- **Janki corrected** (owner decision) by TEST Accounts with `correct_vendor_balance`: ₹1,11,500 → ₹1,21,500. Audit via "balance corrected: GRN-17 under-charge (₹1,00,000 charged for a ₹1,10,000 receipt by the old browser-side write), now corrected — owner decision 2026-09-29". GRN-1/GRN-2 not attached.
- **Left as is:** TEST-V-1 (−₹3,839); the slow-save timing log (a future idea). See SESSION-STATE.md.
