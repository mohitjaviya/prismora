// C6 clean-up as TEST Admin: put the 2 Balm units back (recorded adjustment), remove the TEST incentives, orders and scheme.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
const ENV = Object.fromEntries(readFileSync('D:/PRISMORA/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const T = Object.fromEntries(readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const db = (sql) => execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim());
const a = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await a.auth.signInWithPassword({ email: T.TEST_ADMIN_EMAIL, password: T.TEST_ADMIN_PASSWORD });
const batch = db(`SELECT "inventoryId" FROM stock_movements WHERE note LIKE '%SCH-TEST-C6%' AND kind='adjustment' AND quantity=-2`)[0];
const r1 = await a.rpc('adjust_stock', { p_inventory_id: batch, p_change: 2, p_reason: 'TEST C6 clean-up: free goods test units put back' });
const r2 = await a.from('distributor_incentives').delete().eq('schemeId', 'SCH-TEST-C6').select('id');
const r3 = await a.from('orders').delete().in('customerName', ['TEST C6 order 1', 'TEST C6 order 2']).select('id');
const r4 = await a.from('schemes').delete().eq('id', 'SCH-TEST-C6').select('id');
console.log('put back:', r1.error?.message || JSON.stringify(r1.data), '| incentives:', r2.error?.message || r2.data.length, '| orders:', r3.error?.message || r3.data.length, '| scheme:', r4.error?.message || r4.data.length);
console.log(db(`SELECT (SELECT sum(quantity) FROM inventory WHERE product='TEST Unrated Balm 25g') balm, (SELECT count(*) FROM distributor_incentives WHERE "schemeId"='SCH-TEST-C6') inc, (SELECT count(*) FROM orders WHERE "customerName" LIKE 'TEST C6%') ord, (SELECT count(*) FROM schemes WHERE id='SCH-TEST-C6') sch, (SELECT count(*) FROM expenses WHERE description LIKE '%SCH-TEST-C6%') exp`).join(' / '));
