# Phase 1 fixes: summary

Batches 1–4, applied to the demo database and live on https://prismora-henna.vercel.app as of 2026-09-28. Details and test results are in FIX-BATCH-1.md to FIX-BATCH-4.md. Every database change is its own numbered migration, and all are listed in `migrations/README.md`.

## Fixed

### Batch 1: access security

| Finding | Fix | Migration |
|---|---|---|
| D-02 | A Sales Executive sees only their own leads and orders. A Sales Manager sees the team's, plus partner orders. | 043 |
| D-03 | The four tables open to every signed-in user are closed. Notifications can be sent to others but only read by their recipient. | 043 |
| D-04 | A partner can't re-point or activate its own user row, only change its name. | 043 |
| D-05 | Partner orders are priced by the database from its own tier. A partner can't edit value, items or status. | 043 |
| D-06 | Invoices are shown to a partner by its party id, never by name. | 043, 045 |
| D-07 | Users can be deactivated. An Inactive user loses access at once, even with an open session. | 043 |
| Found in testing | A partner can't cancel an order that's been invoiced, and can confirm receipt only once it's Shipped or Delivered. | 044 |
| Slow or lost saves (O9/O6) | Pages wait for a confirmed sign-in. Saves wait for the first data load. Slow saves are logged. | 042 + app |

### Batch 2: role fixes

| Finding | Fix | Migration |
|---|---|---|
| D-01 | Purchase Manager restored to its original setup. | 046 |
| D-01 follow-ups (owner decisions) | Purchase Manager: Accounting set to none; Distributors/Dealers/Retailers set to none. | 047, 050 |
| D-11 | Approving a field expense books it in the database. Accounts can see field expenses. | 046 |
| D-12 | Accounts can record partner payments, and each payment moves the balance. | 046 |
| D-22 | Credit notes move the balance and belong to the partner by id. | 046 |
| D-09 / D-10 | Sales can send their own Pending order to the warehouse or cancel it. Rolling back a lead cancels its order instead of deleting it. | 046 |
| NEW-01 | No more "Access Denied" on a refresh or direct link after a role is changed. | app |
| NEW-03 | Director has an Audit Log link. | app |
| Found in testing | Editing an order no longer resets its date to midnight UTC; the day is read in local time. | app |

### Batch 3: money and stock

| Finding | Fix | Migration |
|---|---|---|
| NEW-02 and the balance review | Five approved balance corrections. Balances now move only through invoices, payments and credit notes. The Accounting screen has a Balance check. Money entries are hidden from roles without Accounting view. | 048, 049 |
| D-20 | Partial goods receipts: the PO becomes Partially Received, and receipts can't exceed what was ordered. PO-1 reopened. | 051, 052 |
| D-18 | Expired stock is never counted, sold or delivered. The refusal message names the quantities. | 052 |
| D-17 | GST place of supply, and the CGST+SGST or IGST split, are decided and kept when the invoice is issued. Seller details come from Settings → Company. | 053 |
| D-19 | A delivered order is final for every role. The message points to a sales return. | 054 |
| D-22 (stock) | A sales return puts stock back into the same batch and raises a credit note. It can never exceed what was delivered. | 054, 055, 056 |
| D-16 | Invoice status (Unpaid, Partially Paid, Settled, Overdue) comes from payments, in the database. A nightly pg_cron job at 00:05 IST sets Overdue. | 057 |
| Hard-coded text | Brand line and jurisdiction come from Settings and are kept on each invoice. The "Janki Herbals" leftovers are removed. | 058 |

### Batch 4: lead attachments

| Finding | Fix | Migration |
|---|---|---|
| D-21 | Files are stored in Storage and follow the lead's access rules. Limits: 10 MB; PDF, images, Word, Excel. Files are removed with the lead. | 059 |
| Found in testing | A Sales Executive couldn't add a lead because every id they tried was already taken. Next ids now come from the whole table. | 060 |
| D-08 (in part) | Deleting a lead or an order now asks for confirmation first. | app |

## Not fixed yet (medium and low)

| Finding | Severity | What's still wrong |
|---|---|---|
| D-08 | Medium | View-only roles still see Add, Edit and Delete buttons on Orders and Leads (and Director on SFA). The database refuses the action, but the screen offers it. |
| D-13 | Medium | Activity events can be written only by roles with Reports full. Most roles' own actions never reach the Activity feed or the bell. |
| D-14 | Medium | Master lists (such as lead sources) can be read only by settings roles. Everyone else sees the built-in defaults, not custom entries. |
| D-24 | Medium | Purchases exports use wrong field names: PO Total, Vendor City/State and Returns Product/Quantity export as "undefined". |
| D-25 | Medium | Invoice reminders fall back to a hard-coded phone number (9876543210) and email when the partner has none. |
| D-15 | Low | The Roles screen card for admin-level roles shows every module as full. |
| D-23 | Low | Not reproduced. Incentives are created when an order is placed, not on delivery. How free goods affect stock is unchecked. |
| D-26 | Low | Documentation lists lead, invoice and complaint statuses that don't exist. |
| Forms (seen during testing) | Medium | Phone, GSTIN and pincode aren't validated, and duplicates aren't checked. |
| Forms (seen during testing) | Medium | Several forms have no double-submit guard: Schedule Route, Submit Claim, PO, vendor, vendor payment, expense, scheme, complaint, territory, product, team member. |
| TEST-CMP-1 | Low | The Distributor can't see its own complaint, which has no `distributorId`. This is left for the Phase 2 partner story. |
| Not yet tested | — | Pending-partner browser sign-in after approval (P1-PEND-05). Admin-only writes attempted by other roles (P1-VIEW-13). |
