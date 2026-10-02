# Phase 2 H — Dashboard, report, export and print numbers vs the database

Date: 2026-10-02. Live site (https://prismora-henna.vercel.app), live database.
Read-only: no data changed, no fixes, no migrations, no deploy.
Evidence and scripts: `test-results/full-test/phase2h/`.

## Method
- **Truth:** read-only SQL (`supabase db query`) plus REST reads as TEST Super Admin. The REST row counts were checked against SQL counts.
- **Screen:** a scripted Chrome session signed in as the real test roles (Super Admin, Director, Sales Exec 1, Sales Manager, Distributor, Distributor 2, Dealer, Retailer, P2E Distributor). Each number was read off the page.
- **Exports:** every CSV was downloaded and parsed, then compared with the screen and with the database.
- **Print:** all 73 invoice print previews were opened one by one. For each I checked the base, CGST, SGST, IGST and grand total, the line-item sum, the place of supply, the title (Tax / Proforma) and the amount in words.

Database snapshot used: 135 orders (16 cancelled), 73 invoices (52 tax, 21 proforma), 31 leads, 27 stock batches (2,553 units), 15 expenses (₹8,300), 17 credit notes (₹25,229.20), 18 POs, 3 vendors.

## Findings

Rule for this phase: any mismatch is CRITICAL. Display rounding to whole rupees is listed separately and not counted as a mismatch.

| # | Sev | Where | Shown | Database / other screen | Cause (code) |
|---|-----|-------|-------|-------------------------|--------------|
| H1 | CRITICAL | Reports → GST / HSN Summary (GSTR-1), screen + CSV | CGST ₹4,586, SGST ₹4,586, IGST ₹296 | Stored on invoices: CGST ₹4,392.50, SGST ₹4,392.50, IGST ₹683 | Decides intra/inter-state from the linked **order's** state, and assumes Gujarat when there is no order. It ignores the invoice's own `supplyType`/`cgst`/`sgst`/`igst` (053). 5 inter-state direct invoices (₹387 IGST) are reported as CGST+SGST. `Reports.jsx:224-245` |
| H2 | CRITICAL | Reports → Invoice Register, screen + CSV | CGST = SGST = tax ÷ 2 on every invoice (CSV ₹4,734 each). No IGST column | CGST ₹4,392.50, SGST ₹4,392.50, IGST ₹683 | Splits tax 50/50, so all 16 inter-state invoices show IGST as CGST/SGST. `Reports.jsx:156-169` |
| H3 | CRITICAL | Reports → Outstanding Receivables, screen + CSV | Total ₹44,217 (27 rows) | Amount actually due ₹43,937 (Accounting shows ₹43,937) | Uses the full invoice total, so the ₹280 already received on the Partially Paid invoice is ignored. `Reports.jsx:177-183` (should use `amountDue`) |
| H4 | CRITICAL | Director → Receivables Ageing | 0–30 days ₹44.2k | ₹43,937 due | Same cause as H3: invoice total, not amount due. `DirectorDashboard.jsx:101-108`. "Overdue now ₹560" is correct |
| H5 | CRITICAL | Director → "Total Outstanding" | **₹-52.6k** ("27 invoices unpaid") | Invoices still due ₹43,937 | Adds every partner's stored balance, including credit balances (TEST Distributor −₹61,356, Gujarat super stockist −₹11,200, 28 distributor −₹5,040, Demo Dealer −₹2,500). Advances cancel out the dues, so the card shows a negative receivable next to 27 unpaid invoices. Each partner balance on its own is correct (see Verified). `DirectorDashboard.jsx:88-91` |
| H6 | CRITICAL | Profit: Director vs Accounting vs Reports | Director: Revenue (Paid) ₹1.02L, Gross Profit **+₹93.6k (91.9%)**. Reports P&L: same, +₹93,561 | Accounting: Net Sales ₹71,784, Net Profit **−₹1,72,935** | The Director dashboard and the Reports P&L count GST as revenue (₹4,848), do not deduct credit notes (₹25,229) and leave out goods purchased (₹2,36,419). Accounting does all three. Two screens show a healthy profit while the books show a loss. `DirectorDashboard.jsx:115-121`, `Reports.jsx:207-216` |
| H7 | CRITICAL | "Revenue" means three different things | Admin Dashboard "Total Revenue" ₹2,93,825; Reports Sales Summary "Revenue" ₹2,93,825; Director "This Year" ₹2.94L | Paid ₹1,01,861; Accounting net sales ₹71,784 | The Dashboard and Sales reports sum **order value** of every non-cancelled order, including 56 Pending (₹65,625) and orders never invoiced. The sum matches the orders table, but calling it "Revenue" contradicts Accounting. Labels or definitions need deciding |
| H8 | CRITICAL | Purchases → "Pending GRN" KPI | 0 | 2 POs with status `Ordered` (₹14,001) waiting for goods | The KPI counts only `Confirmed`/`Partially Received`. `Ordered` is a legacy status from the seed data (migration 002): such a PO is styled as Draft and has no Receive action. `Purchases.jsx:110` |
| H9 | CRITICAL | Purchases → Export (Purchase Orders CSV) | `Total` = "undefined" on all 18 rows | PO totals ₹1,29,981 | Export reads `po.totalAmount`; the field is `po.total`. `Purchases.jsx:218` |
| H10 | CRITICAL | Reports → Sales by Product; Admin Dashboard → Product Demand | Products such as "Neem + Aloe Hand Wash +2 more items" | Director "Top Products" splits by line item (Aloevera ₹1,60,400 etc.) | Groups by the order's summary label, not by its `items`, so multi-item orders appear as fake products and real products are under-counted. `Reports.jsx:68-77`, `Dashboard.jsx:162` |
| H11 | CRITICAL | Admin Dashboard → Product Demand | Includes cancelled orders (TEST Neem Face Wash 187 units) | Non-cancelled: 166 units (Reports "Qty Sold" excludes cancelled) | No status filter on the demand chart. `Dashboard.jsx:162-165` |
| H12 | CRITICAL | Low-stock count: Inventory vs Reports | Inventory "Low / Critical" 9 | Reports "Low Stock / Reorder" 10 batches | Inventory gives Expired/Expiring precedence over Low; Reports counts every batch with qty ≤ reorder level, including expired stock that can't be sold. The two screens disagree |
| H13 | MEDIUM | Proforma invoices in financial totals | Invoice Register "All GST invoices", GST summary (as 0 % lines), Receivables (+₹1,770), P&L/Director revenue (+₹53,900 paid) | 21 proforma (`auto_draft`) invoices | Proformas are requests for payment, not tax invoices. They are counted as sales and as GSTR-1 rows. Only Accounting's filter separates them. Needs an owner decision |
| H14 | MEDIUM | Orders → Export | `items` column = "[object Object]" | Line items exist on the orders | The export writes the raw object. The other order columns, and the row count (135), value (₹2,96,135) and quantity (2,668) totals, are correct |
| H15 | LOW | Reports Invoice Register (screen only) | Sum of shown CGST ₹4,738 | CSV ₹4,734 | Each row is rounded to whole rupees on screen (₹30.50 → ₹31). This is display rounding, not a data error |
| H16 | LOW | Unknown URL (e.g. `/dashboard`) | Blank page | — | No catch-all / not-found route in `App.jsx`. Found while testing |
| H17 | LOW | Reports → TDS Estimate | Always empty | 15 expenses, none in Rent/Salaries/Marketing/Logistics | Consistent with the data. Not verifiable with numbers until such expenses exist |

## Verified correct (screen = CSV = database)
- **Admin Dashboard (Super Admin):** leads 31, conversion 41.9 %, pipeline ₹47,000, revenue ₹2,93,825, this month ₹39,600.
- **Role-filtered Dashboards:**
  - Sales Exec 1: 18 leads, 22.2 %, pipeline ₹21,200, revenue ₹15,720.
  - Sales Manager (team): 19 leads, 21.1 %, pipeline ₹26,200, revenue ₹18,250.
- **Director:**
  - Sales: today ₹2.5k, month ₹39.6k, year ₹2.94L.
  - Network: 17/3/3, none pending.
  - Stock: value ₹2.29L, 23 products out of stock.
  - Lists: top 5 products, leaderboard (orders and value per rep), overdue ₹560, alerts (Aloevera 25 units left).
- **Accounting:**
  - Sales: invoiced and paid ₹97,013, credit notes ₹25,229, net sales ₹71,784, GST to remit ₹4,848.
  - Costs: expenses ₹8,300, goods ₹2,36,980 − returns ₹561 = ₹2,36,419.
  - Balances: vendor payables ₹1,49,360, net profit −₹1,72,935, outstanding ₹43,937 (27 invoices), 17 credit notes.
- **Reports Hub:**
  - Sales: Sales Summary, Sales by Product and Sales by City totals (₹2,93,825, 119 orders, 2,647 units). Order Status: 135 rows, ₹2,96,135, in the CSV. The screen shows the first 100 rows and says so.
  - Inventory: Stock Summary (27 batches, 2,553 units, ₹2,28,975), Low Stock (10).
  - Financial: Invoice Register (count, subtotal ₹1,36,330, total ₹1,45,798), Expense (₹8,300).
  - CRM: Lead Pipeline (31, ₹2,03,110), Lead Source, Complaints (8).
  - Team: Distributor Outstanding (17, −₹57,015.20), Active Schemes (1).
  - Every report's CSV matches its screen table row for row.
- **Ledger (staff view, all 23 partners) and the Export statement CSV:** the closing balance equals the stored `outstandingAmount` for every partner. There is no drift.
- **Partner dashboards and ledgers:**
  - TEST Distributor: −₹61,356, 46 entries.
  - Distributor 2: ₹4,901.
  - Dealer: ₹3,961.
  - Retailer: ₹2,671.
  - P2E Distributor: 2 orders / ₹2,500 this month.
  - Credit utilisation and active schemes are also correct.
- **Distributor Stock screen:** received 456 units, awaiting confirmation 454, 17 deliveries (Distributor 2: 7 / 7 / 1).
- **Inventory screen:** batches 27, expired units 1,540, stock value ₹2,28,975, per-product totals.
- **Incentives:** paid ₹1,055, 2 rows, CSV equal. **Claims:** settled ₹55, CSV equal.
- **Purchases:** total POs 18, this month ₹22,000, payables ₹1,49,360, 3 vendors.
- **Other CSV exports:** Leads, Inventory, Distributors, Dealers, Retailers (outstanding and credit limits), Complaints and Schemes all match the database. Schemes exports the filtered Active tab (1 row), as shown on screen.
- **Invoice print / PDF view: all 73 invoices correct.** Base, CGST, SGST, IGST, grand total, line items, place of supply, Tax/Proforma title and amount in words all match the stored invoice.

## Not covered
- The Dealer and Retailer Incentives and Stock pages did not finish loading inside the script's wait. Their dashboards and ledgers were verified.
- The Director "Top States" and Admin "Lead Status" charts were checked from code and data, not read off the chart.
- Date-range filters in the Reports Hub were not exercised. All checks ran with no filter.

## Suggested fix batch (needs owner approval)
1. GST figures: use the invoice's stored CGST, SGST and IGST in the Invoice Register and GSTR-1 reports (H1, H2).
2. Outstanding figures: use `amountDue` in Receivables and Ageing, and decide how credit balances appear in the Director's "Total Outstanding" (H3–H5).
3. Revenue and profit: agree one definition and label for each (order value vs invoiced vs collected), and make Director and Reports P&L follow Accounting (H6, H7). Also decide how proformas are treated (H13).
4. Purchases: fix the PO export `total` (H9). Migrate the legacy `Ordered` POs, or count them as pending (H8).
5. Product numbers: split them by line items and leave out cancelled orders (H10, H11). Use one low-stock definition (H12). Export order items readably (H14).
