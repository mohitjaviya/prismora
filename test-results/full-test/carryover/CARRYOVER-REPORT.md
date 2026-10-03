# Carry-over checks (2026-10-04) — report only, nothing fixed

Local app against the live database, each role signed in as itself. Writes only on TEST rows, all removed afterwards (C6), or inside rolled-back transactions (C7). Scripts and logs are in this folder; screenshots are in `shots/`.

| Check | Result |
|---|---|
| C1 Login, register, shell | **Pass.** Empty and wrong-password sign-ins are refused ("Invalid email address or password…"). `/register` and the 3 sign-up pages load, and an empty sign-up stays on the form. As Admin: all 29 sidebar paths open; search "TEST" finds leads and orders; the bell opens; the theme toggles; the AI chat opens and closes (with its own Close button; Escape doesn't close it, by design); Sign Out works. No page errors. |
| C2 768/375 px × light/dark | **Pass with 2 LOW.** 20 pages across Admin, Distributor and Sales Exec 1, each at 2 widths × 2 themes: no page scrolls sideways, and dark mode applies everywhere. |
| C3 Reports date filter | **FAIL.** See finding 1. |
| C4 Dealer/Retailer Incentives + Stock | **Pass.** All 4 dealer/retailer logins load both pages. |
| C5 Director Top States, Admin Lead Status | **Pass.** Top States shows Gujarat ₹1,83,860, Punjab ₹90,000, Maharashtra ₹11,870 and Unknown ₹8,275, equal to the database. Lead Status shows Lead Created 17, First Order 13, Meeting 1 and Negotiation 1, matching the database. |
| C6 Free-goods stock | **FAIL.** See finding 2. |
| C7 Partner confirms receipt | **Pass.** As the real Distributor (rolled back): its own delivered order is confirmed, with the time and "partner" as the source; confirming twice is harmless. Refused: another partner's order, a Pending order, a direct update, and a staff user. The browser offers Confirm Receipt on a delivered order (not clicked, because a partner's confirmation can't be undone in the app). |
| C8 Lead drag refusal | **Pass.** Sales Exec 1 drags L16 on the board and the database refusal is simulated by intercepting the save. The refusal message is shown, the card goes back to "Lead Created", and the database is unchanged. |

## Findings

1. **Reports date filter drops the early hours of the "from" day (Phase 2 H rule: a report mismatch).** `Reports.jsx:49-55` reads the "from" date as midnight UTC, which is 05:30 India time. The "to" date is read in local time. Anything stamped between 00:00 and 05:30 IST on the first day is left out.
   - Invoice Register for 29 Sep to 29 Sep shows **8 tax invoices; the database has 12**. Missing: INV-1790621645160, -954342, -973293 and INV-1790622335658 (issued 00:24–00:35 IST).
   - It affects every date-filtered report: Sales, Invoice Register, GST, P&L, Expenses, Leads and Team.
   - Rows in that window today: 8 orders, 5 invoices and 4 leads.
2. **MEDIUM: free goods paid out by Accounts never leave stock.** Accounts has Incentives full but no Inventory access. "Mark Paid" on a free-goods incentive finds no batch (Accounts can't see inventory), so the units stay in stock and the incentive reads Paid. At best the screen says "stock was short", which is untrue.
   - Real test: TEST scheme "2 free Balm", 2 portal orders by TEST Distributor. Accounts paid one: Balm stayed at 55, no movement row. Admin paid the other: 55 → 53, movement row "adjustment −2 by TEST Admin".
   - The payout is also three separate browser writes (expense, stock, status), and the stock result is not checked.
   - Clean-up: the 2 units were put back by a recorded adjustment, and the TEST scheme, 2 orders (O316, O317) and 2 incentives were deleted. Balm is at 55; nothing is left over.
3. **LOW: Orders at 375 px**: the "+ Add Order" button is cut off at the right edge, with only "Add O" visible (`shots/ADMIN-_orders-375-dark.png`).
4. **LOW: the partner dashboard in credit** shows "Outstanding −₹61,356" and "−12% of ₹5,00,000 limit" (`shots/DISTRIBUTOR-_-375-light.png`). The staff side shows credit separately (Phase 2 H decision); the partner side doesn't.

Noted, not a bug: the sign-up form has no address, pincode or territory fields. This is already in batch 16.
