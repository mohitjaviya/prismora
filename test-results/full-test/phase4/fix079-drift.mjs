import { run } from './rolerun.mjs';
const out = run([{ who: 'ACCOUNTS', id: 'drift', sql: 'SELECT * FROM partner_balance_drift()' }]);
console.log('partner_balance_drift as Accounts:', out.drift.ok ? out.drift.text : 'REFUSED ' + out.drift.text);
