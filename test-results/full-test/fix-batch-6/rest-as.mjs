// REST as a real signed-in role. Reads URL/key from .env and logins from
// .env.test-accounts.local; never prints them.
import { readFileSync } from 'node:fs';

const env = {};
for (const f of ['D:/PRISMORA/.env', 'D:/PRISMORA/.env.test-accounts.local']) {
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;

export async function as(role) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env[`TEST_${role}_EMAIL`], password: env[`TEST_${role}_PASSWORD`] }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed for ${role}: ${r.status}`);
  return async (path, opts = {}) => {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: KEY, Authorization: `Bearer ${j.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) },
    });
    const text = await res.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body };
  };
}
