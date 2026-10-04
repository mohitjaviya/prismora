// Clean-up through the app's own rules, as TEST Admin: delete TEST complaint, put the 2 free Balm units back.
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
const rd = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const ENV = rd('D:/PRISMORA/.env'), T = rd('D:/PRISMORA/.env.test-accounts.local');
const a = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await a.auth.signInWithPassword({ email: T.TEST_ADMIN_EMAIL, password: T.TEST_ADMIN_PASSWORD });
const c = await a.from('complaints').delete().like('description', 'TEST B16 complaint%').select('id');
const { data: mv } = await a.from('stock_movements').select('inventoryId,quantity').eq('kind', 'free_goods').like('note', '%TEST B16 free Balm%');
const back = [];
for (const m of mv || []) { const r = await a.rpc('adjust_stock', { p_inventory_id: m.inventoryId, p_change: Number(m.quantity), p_reason: 'TEST B16 clean-up: free goods test units put back' }); back.push(r.error?.message || JSON.stringify(r.data)); }
console.log('complaint deleted:', c.error?.message || c.data?.map(x => x.id).join(','), '| units put back:', back.join(' ; '));
