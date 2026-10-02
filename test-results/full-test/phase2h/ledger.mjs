import { browser, login, go, E } from './glib.mjs';
import { as } from './rest-as.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const get = async (t) => (await SA(`${t}?select=id,name,outstandingAmount`, { headers: { Range: '0-999' } })).body;
const parties = [...(await get('distributors')), ...(await get('dealers')), ...(await get('retailers'))];
const p = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
await go(p, '/ledger');
const N = (s) => Number(String(s).replace(/[₹,\s]/g, '').replace('−', '-'));
const res = [];
for (const party of parties) {
  await p.selectOption('#ledger-viewing-ledger-for', party.id).catch(() => {}); await p.waitForTimeout(500);
  const t = await p.innerText('body');
  const m = t.match(/CURRENT OUTSTANDING\s*\n+\s*(-?₹[\d,]+|₹-[\d,]+)/i) || t.match(/CURRENT OUTSTANDING\s*\n+\s*([^\n]+)/i);
  const screen = m ? N(m[1]) : NaN;
  const driftMsg = /disagree|Account record shows/.test(t);
  const entries = (t.match(/Entries\s*\n+\s*(\d+)/i) || [])[1];
  let csvLast = null, csvSum = null;
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click('button:has-text("Export statement")').catch(() => {})]);
  if (dl) { const csv = readFileSync(await dl.path(), 'utf8').trim().split('\n').slice(1); csvLast = csv.length ? Number(csv[csv.length - 1].split('","').pop().replace(/"/g, '')) : 0; const rows = csv.map(l => l.slice(1, -1).split('","')); csvSum = rows.reduce((s, r) => s + (Number(r[r.length - 3]) || 0) - (Number(r[r.length - 2]) || 0), 0); res.push({ csvRows: rows.length }); res.pop(); }
  const o = { id: party.id, name: party.name, db: Number(party.outstandingAmount), screen, entries: Number(entries), driftMsg, csvLast, csvSum };
  o.flag = Math.abs(o.db - screen) > 0.51 ? 'SCREEN≠DB' : (csvLast !== null && Math.abs(csvLast - o.db) > 0.51 ? 'CSV≠DB' : (csvSum !== null && Math.abs(csvSum - o.db) > 0.51 ? 'CSVSUM≠DB' : 'ok'));
  res.push(o); console.log(o.flag, o.name, 'db', o.db, 'screen', screen, 'csvLast', csvLast, 'csvSum', csvSum, 'entries', entries, driftMsg ? 'DRIFT-MSG' : '');
}
writeFileSync('ledger-res.json', JSON.stringify(res, null, 1));
await browser.close();
