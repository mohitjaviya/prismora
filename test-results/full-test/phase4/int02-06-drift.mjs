// P4-INT-02/06: the DB's own drift checks, asked by the roles that use them (rolled back; read-only anyway).
import { run } from './rolerun.mjs';
const steps = [];
for (const who of ['ACCOUNTS', 'ADMIN', 'SUPER_ADMIN', 'PURCHASE_MANAGER', 'SALES_MANAGER', 'DISTRIBUTOR', 'SQL']) {
  steps.push({ who, id: `partner-${who}`, sql: 'SELECT count(*) n, coalesce(sum(abs(difference)),0) total FROM partner_balance_drift()' });
  steps.push({ who, id: `vendor-${who}`, sql: 'SELECT count(*) n, coalesce(sum(abs(difference)),0) total FROM vendor_balance_drift()' });
}
// Control: does the function actually see drift for Accounts? Plant ₹1 of drift in a sub-transaction (rolled back).
for (const who of ['ACCOUNTS', 'SQL']) {
  steps.push({ who, id: `control-partner-${who}`, setup: `UPDATE distributors SET "outstandingAmount" = "outstandingAmount" + 1 WHERE id = 'D-TEST-2'`, sql: 'SELECT id, difference FROM partner_balance_drift()' });
  steps.push({ who, id: `control-vendor-${who}`, setup: `UPDATE vendors SET "outstandingAmount" = "outstandingAmount" + 1 WHERE id = 'TEST-V-1'`, sql: 'SELECT id, difference FROM vendor_balance_drift()' });
}
const out = run(steps);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), v.ok ? 'OK ' : 'REFUSED', v.text);
