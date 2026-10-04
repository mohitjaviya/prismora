// After the batch 16 TEST clean-up: net profit (the app's own profitAndLoss, on what TEST Accounts reads now and on
// the pre-test backup), partner/vendor balances vs their sources, and both drift checks as TEST Accounts.
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
import { profitAndLoss, partnerBalances } from '../../../src/utils/financials.js';

const rd = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const ENV = rd('D:/PRISMORA/.env'), T = rd('D:/PRISMORA/.env.test-accounts.local');
const sb = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: T.TEST_ACCOUNTS_EMAIL, password: T.TEST_ACCOUNTS_PASSWORD });
const all = async (t) => { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await sb.from(t).select('*').range(from, from + 999); if (error) throw new Error(t + ': ' + error.message); out.push(...data); if (data.length < 1000) return out; } };
const now = { invoices: await all('invoices'), creditNotes: await all('credit_notes'), expenses: await all('expenses'), grn: await all('grn'), purchaseReturns: await all('purchase_returns') };
const B = 'D:/PRISMORA/backups/2026-10-04T02-58-33-335Z/data/public.';
const bk = (t) => { const d = JSON.parse(readFileSync(B + t + '.json', 'utf8')); return Array.isArray(d) ? d : (d.rows || d.data || []); };
const before = { invoices: bk('invoices'), creditNotes: bk('credit_notes'), expenses: bk('expenses'), grn: bk('grn'), purchaseReturns: bk('purchase_returns') };
const pl = (x) => profitAndLoss(x);
const a = pl(now), b = pl(before);
console.log('net profit now (as Accounts):', JSON.stringify(a));
console.log('net profit before batch 16 tests (backup 2026-10-04T02-58-33-335Z):', JSON.stringify(b));
const key = Object.keys(a).find(k => /net.?profit|profit/i.test(k)) || 'netProfit';
console.log(a[key] === b[key] ? `PASS net profit back to the pre-test figure (${key} = ${a[key]})` : `FAIL net profit ${a[key]} vs pre-test ${b[key]}`);
const pd = await sb.rpc('partner_balance_drift'), vd = await sb.rpc('vendor_balance_drift');
console.log(`partner_balance_drift as Accounts: ${pd.error ? pd.error.message : JSON.stringify(pd.data)}`);
console.log(`vendor_balance_drift as Accounts: ${vd.error ? vd.error.message : JSON.stringify(vd.data)}`);
console.log(!pd.error && !vd.error && (pd.data || []).length === 0 && (vd.data || []).length === 0 ? 'PASS both drift checks empty' : 'FAIL drift');
const parties = [...await all('distributors'), ...await all('dealers'), ...await all('retailers')];
console.log('partner balances (stored, as the app sums them):', JSON.stringify(partnerBalances(parties)));
