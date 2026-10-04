import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
const rd = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const ENV = rd('D:/PRISMORA/.env'), T = rd('D:/PRISMORA/.env.test-accounts.local');
const a = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await a.auth.signInWithPassword({ email: T.TEST_ADMIN_EMAIL, password: T.TEST_ADMIN_PASSWORD });
const r = await a.from('schemes').update({ status: 'Inactive' }).in('id', ['SCH-TEST-B16-FG', 'SCH-TEST-B16-PCT']).select('id,status');
console.log(r.error?.message || JSON.stringify(r.data));
