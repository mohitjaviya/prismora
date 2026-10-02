# Phase 2: Business stories — progress

Tested on the live site (prismora-henna.vercel.app) and the demo database, 2026-09-29. Each role used its own login, in a real (headless Chrome) browser. Nothing was fixed or deployed. All new records are named TEST….

- Per-test detail: `phase2/story-A.json`, `phase2/story-B.json`
- Screenshots: `screenshots/phase2/`

## Group A–B: done

| Story | Planned | Pass | Fail | Blocked |
|---|---|---|---|---|
| A. Lead to cash | 18 | 16 | 2 (A06, A09) | 0 |
| B. Things going wrong | 10 | 6 | 4 (B06, B07, B09, B10) | 0 |
| **Total** | **28** | **22** | **6** | **0** |

### Failures, most severe first

| # | Severity | Test | Role / screen | Steps | Expected | Actual | Screenshot |
|---|---|---|---|---|---|---|---|
| 1 | CRITICAL | P2-B10 | Admin / Orders | Open Delivered O118 (GST invoice ₹850 + ₹135), change Order Value to 999, press Update. Then, through the API, PATCH Shipped O113 (invoice ₹2,400 + ₹354) to value ₹1, quantity 1. | An invoiced order's value and quantity are locked, or the change is refused. | Both saved. O118 is now ₹999 against an ₹850 invoice. O113 is ₹1 × 1 against a ₹2,400 invoice. No warning. Balances didn't move (they follow invoices), but the order records now disagree with the bills, so order-based totals will be wrong. | `B10-admin-edits-O118.png` |
| 2 | CRITICAL | P2-B09 | Sales Exec 1 + Sales Manager / Leads | SE1 opens lead L11's edit form. SM then saves a new note on L11. SE1's still-open form saves a phone change. | SE1 is warned that the lead changed, or only the phone is saved. | The stale form saved every field and **silently overwrote the SM's note** (lost update). The audit log shows both saves. | `B09-stale-form-saves.png` |
| 3 | CRITICAL | P2-B07 | Sales Exec 1 / Leads | Add Lead → Save, then the page is refreshed 150 ms later. | The lead is saved, or the user is told it wasn't. | **The lead was never saved.** Nothing appears in the save journal or `client_write_log`, and nothing is shown to the user. (An edit to an existing lead with the same refresh did survive.) | `B07-after-refresh.png` |
| 4 | CRITICAL | P2-A09 | Warehouse Manager / API | PATCH `orders` O113 (Pending, no address) to status Shipped, using the Warehouse's own login. | Refused: Shipped belongs to Dispatch, and leaving Pending needs an address. | **Allowed (200).** O113 went straight to Shipped with no address and was later billed (INV-1790657046836). The stage owners and the address rule exist only on screen, where the same attempt is refused ("Only Dispatch Team can set this status."). | `A09-wh-clicks-delivered.png` |
| 5 | HIGH | (seen in A12, A14, B01, B03, B05) | Accounts, Dispatch, Sales Exec | Any money or order action: convert, deliver, add invoice, record payment, cancel. | About 1 s. | **7–10 s in the browser**, while the server runs each call in under 0.2 s (`pg_stat_statements`; `client_write_log` ids 21–26). The screen shows "Converting…" / "Saving…" and the form stays open meanwhile. Leaving the page during that wait **loses the action with no message**: an SE cancel (B01, 1st try) and two proforma conversions (O120) never reached the database. Measured in headless Chrome. | `B05-diag.png` |
| 6 | HIGH | P2-A06b | Sales Exec 1 / Leads | Two tabs have lead L11 open. Tab 1 converts it (First Order → Create order). Tab 2, loaded earlier, converts it again. | The second conversion is refused ("An order has already been raised for this lead"). | **A second order was created (O115).** The "already converted" check runs only in the browser, on that tab's own copy of the lead, and nothing in the database limits a lead to one order. L11 now has 3 orders (O113, O114, O115). | `A06-stale-tab-second-convert.png` |
| 7 | MEDIUM | P2-A06a, P2-B06 | Sales Exec 1, Admin | Create order / Save Lead / Save Order, clicked twice in the same instant. | One record. | Two records each time (O113 + O114; leads L12 + L13; orders O122 + O123). Two clicks 120 ms apart gave one record (O116, L14, O124), so a normal double-click is guarded. There is no server-side duplicate guard. | `B06-order-double-save.png` |

### Other MEDIUM and LOW findings (the tests themselves passed)

| Severity | Where | Finding |
|---|---|---|
| MEDIUM | Orders, Sales Exec (A07) | A sales rep can type a delivery address and pincode on the order form, but they're **silently thrown away**: the rep can only move the status. The refusal says "needs a delivery address…", and the badge then shows "Processing" although the order is still Pending. The rep also sees "Available 0" / "Out of stock" for products that are in stock (the rep has no inventory access). |
| MEDIUM | Accounting (A15) | **Mark as Paid** settles an invoice with no confirmation and no message. Cancel Order (B01) also has no confirmation. |
| MEDIUM | Activity feed (A04, B01) | A sales rep's lead create/edit/status changes and order cancels write no activity events (`events` insert 403). The SM's Recent Activity shows none of it. This is the known open D-13. |
| LOW | Audit log (A08, A18) | Wrong "via" label: an order's Delivered row, and the partner-balance charge on delivery, say "invoice status from payments and credit notes" instead of "delivery of order …". The person is correct. |
| LOW | Payments (A15) | The payment that Mark as Paid creates (`PAY-INV-…`) has a blank `recordedBy`. The audit log names TEST Accounts. |
| LOW | Accounting (A16) | A custom invoice accepts a due date already in the past, with no warning. It is Overdue at once. |
| LOW | Forms (B08) | Closing a filled Add/Edit form gives no "discard changes?" warning. Nothing is saved and no stale draft is left, so the behaviour is otherwise correct. |
| LOW | Orders (B01) | The lead-converted order shows "Auto-calculated at ₹180/unit (MRP)" next to a ₹110 value. |
| Note | Leads (A05) | Converting a lead of type "Distributor" creates a walk-in order that isn't linked to any partner account, so there's no partner balance or ledger. It works as designed; flagged for the owner. |

### What passed (short)

- **Leads.** All fields, a stored attachment, follow-up, notes, and edits all persist after a refresh. Every status works, including Lost and back. The SM sees the lead and its file.
- **Conversion.** Three products, with a clear warning about the missing address. A refresh prevents a re-convert.
- **Order flow.** SE → Warehouse → Dispatch.
  - Wrong-role clicks are refused on screen.
  - A delivery short of stock is refused on screen and in the database, with the quantities.
  - Stock was taken earliest expiry first, and the expired batch was never used. Lavender: the 20-day batch 3, the far batch 1, the expired batch 0. Neem and Shampoo were also earliest expiry first.
- **GST, as Accounts.**
  - GST line by line: ₹354, ₹270, ₹135, ₹121, ₹65, ₹41, ₹20.
  - Gujarat invoices print CGST + SGST; Maharashtra invoices print IGST (₹985 total checked on the print).
  - Each partner is charged the GST once.
- **Payments.** Partial then full payment: Unpaid → Partially Paid (₹400) → Settled (₹921), with the balance back to ₹0. Mark as Paid works. The overdue custom invoice shows under the Overdue filter.
- **Sales return.**
  - Stock goes back into the batch it came from (TEST-B1 +3).
  - Credit note ₹389.40 (including 18% GST), with the balance reduced once.
  - An over-return is refused with a clear message.
- **Audit log.** 79 rows across Story A, each step by the right person and none "System". The Admin Audit Log screen lists them.
- **Things going wrong.**
  - Cancelling a Pending order works.
  - A Delivered order can't be cancelled, moved back or deleted, on screen or in the database, and the message points to a sales return.
  - Delivering twice (stale tab + double-click): stock, invoice and balance moved once.
  - Billing twice (stale tab): refused with "already invoiced as INV-…". Delivery didn't add a second invoice to an order billed in advance.
  - Converting twice: refused ("already a GST tax invoice"), GST charged once.
  - Closing forms unsaved writes nothing.

### Database checks after each story

| Check | After A | After B |
|---|---|---|
| Balance check (SQL and the Accounting panel) | All balances match | All balances match |
| Negative stock | none | none |
| Expired batch used | never | never |
| Audit rows without a person | 0 | 0 |
| Order value ≠ its invoice | none | O113, O118 (B10) |

**Balances at the end of B:** D-TEST-1 ₹38,643.80 · D-TEST-2 ₹4,901 · DL-TEST-1 ₹3,961 · DL-TEST-2 ₹300 · R-TEST-1 ₹2,671 · R-TEST-2 ₹0.

### Test data created in A–B (all TEST)

| Type | Records |
|---|---|
| Leads | L11 (+ attachment), TEST-P2-DBL-79137, L12, L13, L14 |
| Orders | O113 (Shipped via the A09 API change, then value ₹1 by B10), O114, O115 (Cancelled), O116, O117, O118 (value changed to ₹999 by B10), O119, O120, O121, O122, O123, O124 |
| Invoices | INV-1790621645160, INV-1790621954342, INV-1790621973293, INV-1790622335658, INV-1790654942828 (Overdue), INV-1790656273202, INV-1790656843121, INV-1790657046836, INV-1790657208665 |
| Payments | PAY-1790622413412, PAY-1790622448098, PAY-INV-INV-1790621954342 |
| Returns | SR-1790655371164 / CN-SR-1790655371164 |
| Inventory batches | Lavender TEST-P2-EXP/NEAR/FAR-26592 |

B10 left O113 and O118 with changed values; they're left as found, for the report.

## Group C–D: done (2026-09-29)

Every save was re-read from the database, polling for up to 30–40 s; the screen alone was never taken as proof. Per-test detail is in `phase2/story-C.json` and `phase2/story-D.json`.

| Story | Planned | Pass | Fail | Blocked |
|---|---|---|---|---|
| C. Procure to stock (C01–C08 + C09 PO-1/O101) | 9 | 9 | 0 | 0 |
| D. A field sales day | 9 | 9 | 0 | 0 |

### Findings from C–D

| Severity | Test | Finding |
|---|---|---|
| HIGH (fix list, with B10, A09, B07, B09) | P2-C-VENDOR-BAL | **Vendor balances are moved by the browser, not the database.** A vendor payment is saved as `POST vendor_payments` and then a separate `PATCH vendors`; a GRN is the insert, then `PATCH vendors`. If the second write fails, or the page is left between the two, the payable no longer matches the GRNs, returns and payments. There is no vendor balance check (`partner_balance_drift` covers partners only). No drift was seen in this run: the vendor is at ₹1,000 = ₹4,700 − ₹200 − ₹3,000 − ₹500. |
| HIGH (evidence for the slow-save finding and B07) | P2-C07-silent | **The first vendor payment left no trace** (no row, no balance change, no `client_write_log` entry), and the page moved on 30+ s after the click. The same click sequence, repeated with request capture, sent the writes, and the payment landed **18 s** after the click (the save itself took 10.7 s). The click path works; the first payment was most likely a slow save dropped when the page changed. It can't be fully proven, because the first run did not capture requests. Other C–D saves also took 8–13 s in the browser (vendor insert 12.9 s, vendor payments 8.8 s and 10.7 s). |
| MEDIUM | P2-C07 | Vendor ledger pop-up: right after a payment it still shows "Outstanding payable ₹4,500" (a fresh page shows ₹1,500). Its running balances list the return above the payment, with "Bal ₹1,700" on the payment line, which doesn't match the order things happened in. |
| LOW | P2-C06 | The purchase-return form has no batch field. The app took the 5 units from the newest Neem batch (TEST-P2-GRN-N2, 30 → 25). |
| LOW | P2-D05 | Expense receipts are stored as data inside the claim row (`receiptData`), not in file storage. |
| LOW | P2-D09 | Attendance `approvedBy` stores the approver's name ("TEST Sales Manager"), not a user id. |
| Note | P2-D04 | The field order from a visit is priced at the retailer tier (₹140): 6 × ₹140 = ₹840 for O125. |

### What passed (short)

- **C, as the Purchase Manager.**
  - Vendor with every field. PO-9 with 3 products (₹4,700), Draft then Confirmed.
  - Partial GRN-14 (Neem 20, Shampoo 30) with batch and expiry; the PO became Partially Received and the vendor was charged ₹2,600.
  - Over-receipt (31 when 30 were outstanding) refused with a clear message, nothing saved.
  - Final GRN-15; the PO became GRN Done and the vendor was charged ₹2,100.
  - Purchase return: stock −5, vendor −₹200. Vendor payments: balance ₹1,500, then ₹1,000.
- **C, other roles.**
  - The Warehouse Manager can view POs, GRNs and returns, has no write buttons, and the database refused its writes.
  - PO-1's remaining 100 were received (new batch, expiry 2027-09-30) and PO-1 became GRN Done.
  - O101 was then delivered from that batch only: expired batches and the no-expiry batch were untouched. A ₹10,000 proforma was raised and D-TEST-1 was charged once.
- **D, the Sales Manager and the rep.**
  - The SM assigned beats (SE1 today and tomorrow, SE2 today).
  - SE1 punched in with GPS (23.0225, 72.5714 ±25 m).
  - Visit report with 3 products pitched and an order (O125); the beat became In Progress.
  - Early check-in on tomorrow's beat: the request was Pending, the SM approved it, and SE1 checked in.
- **D, the expense claim.**
  - A ₹350 Travel claim with a receipt is still there in a fresh browser.
  - The SM approved it, which booked EXP-FLD-1790671881267 in the rep's name, audited as the SM. Accounts sees it under "TEST Sales Executive 1".
  - Attendance approval saved. The register and leaderboard match the database.

### Database checks after C and D

- Balance check: all balances match.
- Negative stock: none.
- Audit rows with no person: 0.
- Vendor payable: ₹1,000, which matches its GRNs, return and payments.

**Test data created in C–D (all TEST):**

| Type | Records |
|---|---|
| Vendor | V1790662815332 |
| Purchase order | PO-9 |
| GRNs | GRN-14, GRN-15, GRN-16 (PO-1) |
| Purchase return | PR-1790664107704 |
| Vendor payments | VPAY-1790664747723, VPAY-1790666336465 |
| Batches | TEST-P2-GRN-N1/S1/N2/L1-96897, TEST-P2-PO1-61973 |
| Proforma | INV-1790666261292 (O101) |
| Beats | B-1790666534003, B-1790666541966, B-1790666556515 |
| Attendance | ATT-1790666606117 |
| Visit reports | VR-1790666626060, VR-1790666741071 |
| Order | O125 |
| Early check-in request | ECR-1790666690297 |
| Expense claim | EXP-1790671881267, booked as EXP-FLD-1790671881267 |

O113 and O118 are untouched.

## Group E–F: done (2026-09-30 and 2026-10-02)

Tested on the live site as each real role (own logins), every save re-read from the database. Nothing was fixed. New records are named TEST…. Per-test detail: `phase2/story-E*.json`, `phase2/story-F*.json`; screenshots in `screenshots/phase2/`.

**The open question from the last session is answered:** the new distributor *does* see the TEST products. The partner order list shows the whole catalogue (no filter by status, category or partner type) and the new distributor can read all 29 products. My test script chose options by exact product name, but each option is valued by product id and labelled "name — ₹price". It was a test-script fault, not an app bug.

| Story | Planned | Pass | Fail | Not run |
|---|---|---|---|---|
| E. Partner portal | 6 | 5 (E01–E05) | 0 | 1 (E06 as planned: partner confirms receipt; I ran the "Booked automatically" label check instead, as you scoped it, and it passed) |
| F. Schemes and incentives | 4 | 3 (F01, F03, F04) | 1 (F02) | 0 (but F03's free-goods stock movement was not tested) |

### Failures and findings, most severe first

| # | Severity | Test | Role / screen | What happens | Expected | Evidence |
|---|---|---|---|---|---|---|
| 1 | **HIGH** | P2-F02 | New DISTRIBUTOR, order screen | The distributor places O145 (₹1,400, with ₹1,100 of TEST Neem). It qualifies for the active scheme (5% on TEST Neem, min ₹500, valid 30 Sept–31 Oct), but **no incentive is created**, with no message to anyone. | A ₹55 incentive, created at order time. | Incentives are written by the *placing user's browser*, and the database allows writes to `distributor_incentives` only for staff with Incentives access, never partners (policy `distributor_incentives_write`). The partner's own insert of the ₹55 row: **403** "violates row-level security". The partner's log and activity-event writes are refused too, so nothing is recorded. The same order placed **by Admin for the distributor (O146)** produced the correct ₹55 incentive. So **every scheme incentive on partner-placed orders is silently missed.** Screenshots: `E03-new-distributor-order-placed.png`, `F02-admin-order-saved.png`. |
| 2 | MEDIUM | P2-E03c | New DISTRIBUTOR, sign-up and order | A self-registered distributor has **no address, pincode or territory** (the sign-up form has no address field), so its first order O145 has an empty delivery address and no assignee. Moving it to Processing is refused ("needs a delivery address and a pincode", 062), and the partner order screen has no address field. | The order carries an address, or the partner is asked for one. | O145: `deliveryAddress ""`, `assignedTo null`; Admin PATCH → Processing: HTTP 400. Staff must add the address on the order. |
| 3 | MEDIUM | P2-E05 | New DISTRIBUTOR, Claims; ACCOUNTS | The claim form accepts any amount ≥ 1 against any of the partner's orders. The distributor claimed ₹55 on O145, which earned **no** incentive (finding 1), and Accounts could settle it, which **booked a real ₹55 expense (EXP-CLM-1790930578599)**. Nothing checks the claim against an earned incentive. | The claim is tied to what the scheme actually earned. | CLM-1790930578599 Pending → Settled; the expense row shows "Booked automatically". |
| 4 | LOW | P2-E02 | New DISTRIBUTOR, database | Partners can read **every scheme row** at the database level: Inactive ones and ones meant for Dealers or Retailers only. The screen hides them, which is how the password-bearing scheme name got exposed (since fixed, migration 069). | Only the schemes that apply to the partner. | The new distributor's token read both existing schemes (one Inactive). |
| 5 | LOW | P2-E04 | New DISTRIBUTOR, Complaints | A complaint raised by a distributor is **assigned to the distributor's own user** (CMP-4 `assignedTo U1790706652956`), not to a support person or nobody. | Unassigned, or a support assignee. | The database row. |
| 6 | LOW | P2-F03 | ACCOUNTS, Expenses | Accounts can delete an auto-booked payout's expense with only the generic "Delete this expense record?". The incentive stays Paid and shows as a missing payout until someone presses "Book them". | A warning that the expense belongs to a paid payout. | EXP-INC-… deleted; incentive stayed Paid. |
| – | Known | (SESSION-STATE §4) | | No confirmation when Admin approves a partner; audit actor "System" vs the registrant on sign-up; "Expires in 1 days". Still tracked, not fixed. | | |

### What passed

- **E01:** the registration was Pending (distributor and user); signing in while Pending is refused ("Your account is awaiting admin approval"); Admin's Approve made both Active; the distributor then signed in to its own dashboard. Audit rows: the sign-up as "System" and the registrant, then "TEST Admin … via approval of distributors DIST-…".
- **E02:** the new distributor sees only its own data.
  - **Through its own token:** it reads 1 distributor row, 1 user row, no orders, invoices, payments, leads, complaints or other partners' data.
  - **On screen:** Dashboard, Price List, Schemes, Orders, Ledger and Stock open, and Leads, Accounting and Distributors send it back to its dashboard.
- **E03:** the order was priced by the database at the distributor tier (10 × ₹110 + 2 × ₹150 = ₹1,400, **12 units**, Pending) and **visible** to Admin, Super Admin, Director, Sales Manager, Accounts, Warehouse, Dispatch, Customer Support and Purchase Manager (Purchases view); **hidden** from Sales Exec 1/2, Sales and the other distributors. The new distributor sees only its own.
- **E04:** CMP-4 was raised from the distributor's screen (customer name pre-filled and locked) and is visible to Admin, Customer Support, Sales Manager, Sales Exec and Director. Customer Support moved it Registered → Under Review → Resolved with notes. Each step is audited as "TEST Customer Support", and the distributor reads the resolution through its own login.
- **E05:** CLM-1790930578599 (₹55, TEST scheme, order O145) was raised by the distributor, then Settled by Accounts. That booked EXP-CLM-1790930578599 (Scheme Claim ₹55), audited as TEST Accounts.
- **"Booked automatically" (E06 label check):** on Accounting → Expenses, **exactly 2 of 14 rows** carry the label: EXP-INC-… (an old incentive) and EXP-CLM-… (this claim). Field expenses (EXP-FLD-…) and manually entered rows show the person. No non-system row is mislabelled.
- **F01:** the scheme (SCH-1790706947005, 5% on TEST Neem, min ₹500, 30 Sept–31 Oct) was saved exactly as entered.
- **F02, staff path:** the incentive for Admin's order O146 (₹1,100) is **₹55 = 5% × ₹1,100** (only the TEST Neem lines count), status Earned, created at order time.
- **F03:** Accounts marked it Paid, which booked EXP-INC-… ₹55 ("Scheme Incentive"). Accounts then deleted that expense, which leaves a Paid payout with no expense. Admin's Accounting banner then said "One payout is missing from the books — ₹55", and **"Book them" booked 1 payout worth ₹55**, the incentive's own value.
- **F04:** the booked expense has `createdBy` blank and `assignedTo` blank. Admin (the person who pressed) is not credited anywhere on the row, and it reads "Booked automatically". The audit log does name the person who pressed (TEST Admin created it), which is correct. The database's last-changed stamp (`updatedBy`) is Admin, which feeds "Last changed by" and not the Recorded-by column.
- **The distributor sees its incentive** (₹55, Paid, on O146) through its own login.

### Database checks at the end of E–F

- **Balance check, read with the Accounts login:** partner balances all match, vendor balances all match, and the distributor's balance is ₹0. No negative stock. Audit rows without a person in the last 3 hours: 0.
- **Paid incentives or settled claims with no expense:** 0.
- **Correction to my earlier readings:** the drift functions answer only a signed-in Accounting viewer. The "0 drift rows" lines that I took with the plain SQL role in earlier stories could not have shown a drift. The Accounting panel readings in Accounts' browser ("All balances match") are the valid ones, and the Accounts-token reading above confirms the current state.
- **Vendors:** TEST-V-1 no longer drifts. On 2026-10-01 the owner's own "Account" user ran the vendor Correct balance tool on it (₹1,000 → ₹4,839), and Admin User received two Janki receipts (GRN-18 ₹20,000 via PO-10, GRN-19 ₹2,000 via PO-11), which moved Janki to ₹1,43,500 with its records.

### Test data created in E–F (all TEST)

| Type | Records |
|---|---|
| Distributor | TEST P2E Distributor 35167 = DIST-1790706652956, user U1790706652956, login `test.p2e.dist.35167@prismora.test` (password only in `.env.test-accounts.local`) |
| Scheme | SCH-1790706947005 |
| Orders | O145 (Pending, ₹1,400, no address), O146 (Pending, ₹1,100) |
| Incentive | INC-1790930000025-SCH-1790706947005 (Paid) |
| Complaint | CMP-4 (Resolved) |
| Claim | CLM-1790930578599 (Settled) |
| Expenses | EXP-CLM-1790930578599, EXP-INC-1790930000025-SCH-1790706947005 |

### Suggested fix order (for what E–F found)

1. **F02:** make incentive creation a database function that runs when a partner order is created or delivered (as the partner-order pricing already is), so partner-placed orders earn incentives and a refused write can't be silent. A backfill for existing partner orders that qualified would then be a decision for the owner.
2. **E03 address:** carry the address from a partner's registration (or ask for it on the first order).
3. **E05 claims:** tie a claim to the incentive it comes from, or check the amount against what was earned.
4. **Scheme rows:** limit partners' read access to schemes that apply to them.

## Next: stories G–H. Waiting for "continue".

