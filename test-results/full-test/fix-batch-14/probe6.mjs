// Batch 14 probe 6: no interception at all. Does a real save get slow after the page has been
// idle (no requests) for a while? Toggles TEST scheme SCH-1790405906612 after idle gaps; ends Inactive.
import { login, go } from '../phase3/lib.mjs';
const GAPS = (process.env.GAPS || '1,8,15,30,8,1').split(',').map(Number);
const page = await login('ADMIN');
const net = []; const T0 = Date.now();
// Chrome's own view of each write: protocol, connection reused or new, and where the time went (ms).
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
const cdpLog = []; const methods = {};
cdp.on('Network.requestWillBeSent', e => { methods[e.requestId] = e.request.method; });
cdp.on('Network.responseReceived', e => {
  const t = e.response.timing; if (!t || methods[e.requestId] === 'GET') return;
  const r = (a, b) => (a >= 0 && b >= 0 ? Math.round(b - a) : null);
  cdpLog.push({ m: methods[e.requestId], proto: e.response.protocol, reused: e.response.connectionReused, conn: e.response.connectionId,
    queued: Math.round(t.dnsStart >= 0 ? t.dnsStart : t.connectStart >= 0 ? t.connectStart : t.sendStart), dns: r(t.dnsStart, t.dnsEnd), connect: r(t.connectStart, t.connectEnd), ssl: r(t.sslStart, t.sslEnd),
    send: r(t.sendStart, t.sendEnd), wait: r(t.sendEnd, t.receiveHeadersEnd) });
});
page.on('request', r => { r._t = Date.now() - T0; });
page.on('requestfinished', r => net.push({ s: r._t, e: Date.now() - T0, m: r.method(), u: new URL(r.url()).pathname.slice(0, 60) }));
page.on('requestfailed', r => net.push({ s: r._t, e: Date.now() - T0, m: r.method(), u: 'FAILED ' + r.url().slice(0, 60) }));
page.on('websocket', ws => net.push({ s: Date.now() - T0, e: 0, m: 'WS', u: ws.url().slice(0, 60) }));
await go(page, '/schemes');
await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {});
await page.waitForTimeout(300);
const tgl = page.locator('div', { hasText: 'TEST Distributor Scheme 5pct' }).filter({ has: page.locator('button[title="Activate"], button[title="Deactivate"]') }).last().locator('button[title="Activate"], button[title="Deactivate"]').first();
let want = 'Active';
for (const gap of [...GAPS, ...(GAPS.length % 2 ? [1] : [])]) {
  await page.waitForTimeout(gap * 1000);
  await tgl.click();
  await page.waitForFunction((w) => document.body.innerText.includes(`is now ${w}`) || document.body.innerText.includes('No answer from the server'), want, { timeout: 40000 }).catch(() => {});
  const endAt = Date.now() - T0;
  const j = await page.evaluate(() => (window.__prismoraWriteLog || []).filter(e => e.end).pop());
  console.log(`idle ${gap}s → ${want}: save ${j?.ms} ms ok=${j?.ok}`);
  const last = cdpLog.filter(c => c.m === 'PATCH').pop();
  if (last) console.log(`    PATCH timing: ${JSON.stringify(last)}`);
  if (j?.ms > 3000) for (const n of net.filter(n => n.e >= endAt - j.ms - 3000 && n.s <= endAt)) console.log('   ', n.s, '→', n.e, n.m, n.u);
  want = want === 'Active' ? 'Inactive' : 'Active';
  await page.waitForTimeout(500);
}
await page.context().close(); process.exit(0);
