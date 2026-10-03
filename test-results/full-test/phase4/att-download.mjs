// RISK-ATT (2) download through the real Storage API as signed-in roles (read-only: list + signed URL + fetch).
import { readFileSync } from 'node:fs';
import { createClient } from '../phase3/node_modules/@supabase/supabase-js/dist/index.mjs';
const rd = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const env = { ...rd('D:/PRISMORA/.env'), ...rd('D:/PRISMORA/.env.test-accounts.local') };
const FILE = 'L11/1790620251290-TEST-P2-visiting-card.pdf';
for (const who of ['SALES_EXEC_1', 'SALES_MANAGER', 'DIRECTOR', 'SALES_EXEC_2', 'DISTRIBUTOR']) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: e0 } = await sb.auth.signInWithPassword({ email: env[`TEST_${who}_EMAIL`], password: env[`TEST_${who}_PASSWORD`] });
  if (e0) { console.log(who.padEnd(14), 'SIGN-IN FAILED', e0.message); continue; }
  const list = await sb.storage.from('lead-attachments').list('L11');
  const signed = await sb.storage.from('lead-attachments').createSignedUrl(FILE, 120);
  let got = '-';
  if (signed.data?.signedUrl) { const r = await fetch(signed.data.signedUrl); const b = Buffer.from(await r.arrayBuffer()); got = `HTTP ${r.status}, ${b.length} bytes, ${r.headers.get('content-type')}, starts "${b.toString('latin1', 0, 8)}"`; }
  const anon = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/lead-attachments/${FILE}`);
  console.log(who.padEnd(14), `list=${list.data?.length ?? 'err ' + list.error?.message}`, `| signed=${signed.data ? 'yes' : 'no (' + signed.error?.message + ')'}`, `| download: ${got}`, `| public URL: HTTP ${anon.status}`);
  await sb.auth.signOut();
}
