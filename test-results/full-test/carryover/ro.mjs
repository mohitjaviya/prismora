// Carry-over checks, read-only (report only): C1 login/register/shell, C2 768/375 px x light/dark,
// C3 Reports date filter, C4 Dealer/Retailer Incentives + Stock, C5 Director Top States / Admin Lead Status.
// Local app, live DB. Run from Git Bash: CHROME_ARGS=--disable-quic node ro.mjs [C1 C2 ...]
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { browser, login, go, settle, BASE, E } from '../phase3/lib.mjs';

const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);
const db = (sql) => execSync(`node ../phase4/q.mjs -e "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n').slice(1, -1).map(s => s.trim());
const out = [];
const say = (ok, id, what) => { const l = `${ok === null ? 'NOTE' : ok ? 'PASS' : 'FAIL'} ${id} ${what}`; out.push(l); console.log(l); };
mkdirSync('shots', { recursive: true });
const text = (p) => p.evaluate(() => document.body.innerText);

// ── C1 login / register / shell ──
if (want('C1')) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE + '/login'); await p.waitForSelector('input[type="password"]');
  await p.click('button[type="submit"]'); await p.waitForTimeout(800);
  say(p.url().includes('/login'), 'C1.1', 'empty sign-in stays on the login page (browser requires the fields)');
  await p.fill('input[type="email"], input[name="email"], input[type="text"]', E.TEST_ADMIN_EMAIL);
  await p.fill('input[type="password"]', 'WrongPassword123'); await p.click('button[type="submit"]'); await p.waitForTimeout(4000);
  const lt = await text(p); const m = lt.match(/[^\n]*(invalid|incorrect|wrong|failed)[^\n]*/i);
  say(!!m && p.url().includes('/login'), 'C1.2', `wrong password refused: "${m?.[0]?.trim() || 'no message'}"`);
  for (const r of ['/register', '/register-distributor', '/register-dealer', '/register-retailer']) {
    await p.goto(BASE + r); await p.waitForTimeout(2500);
    const t = await text(p); say(t.length > 100 && !/Page not found/i.test(t), 'C1.3', `${r} loads (${t.split('\n').find(x => x.trim().length > 3)?.trim().slice(0, 50)})`);
  }
  // Distributor sign-up: empty submit, then bad GSTIN/phone/pincode (refused before anything is saved)
  await p.goto(BASE + '/register-distributor'); await p.waitForTimeout(2500);
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(800);
  say(p.url().includes('/register-distributor'), 'C1.4', 'empty sign-up submit stays on the form');
  const fields = await p.$$eval('input', els => els.map(e => ({ id: e.id, name: e.name, type: e.type, ph: e.placeholder })));
  say(null, 'C1.4b', `sign-up fields: ${fields.map(f => f.id || f.name || f.ph).join(', ')}`);
  say(errs.length === 0, 'C1.5', `no page errors on login/register (${errs.join(' | ') || 'none'})`);
  await ctx.close();

  const a = await login('ADMIN'); await go(a, '/');
  // Every path the sidebar defines (sections start collapsed, so the rendered links are only a few).
  const links = [...new Set([...(await import('node:fs')).readFileSync('D:/PRISMORA/src/components/Sidebar.jsx', 'utf8').matchAll(/path: '([^']+)'/g)].map(m => m[1]))].concat('/', '/settings', '/profile');
  const bad = [];
  for (const h of links) { await go(a, h); const t = await text(a); if (/Page not found|Access Denied/i.test(t) || t.length < 80) bad.push(h); }
  say(bad.length === 0, 'C1.6', `Admin sidebar: ${links.length} links all open (${bad.join(', ') || 'none bad'})`);
  await go(a, '/');
  const search = a.locator('header input[type="text"], header input[type="search"], input[placeholder*="Search" i]').first();
  await search.fill('TEST'); await a.waitForTimeout(1500);
  const st = await text(a); say(/TEST/.test(st) && /(lead|order)/i.test(st), 'C1.7', 'topbar search "TEST" shows lead/order results');
  await search.fill(''); await a.keyboard.press('Escape');
  const bell = a.locator('header button:has(svg.lucide-bell)').first();
  await bell.click(); await a.waitForTimeout(800); const bt = await text(a);
  say(/notification/i.test(bt), 'C1.8', 'bell opens the notifications panel'); await a.keyboard.press('Escape');
  const before = await a.evaluate(() => document.documentElement.className);
  await a.locator('header button:has(svg.lucide-sun), header button:has(svg.lucide-moon)').first().click(); await a.waitForTimeout(500);
  const after = await a.evaluate(() => document.documentElement.className);
  say(before !== after, 'C1.9', `theme toggle switches <html> class (${before} -> ${after})`);
  await a.locator('header button:has(svg.lucide-sun), header button:has(svg.lucide-moon)').first().click();
  const ai = a.locator('button[title*="AI" i], button[aria-label*="AI" i], button:has(svg.lucide-bot), button:has(svg.lucide-sparkles)').last();
  if (await ai.count()) { await ai.click(); await a.waitForTimeout(800); const open = /PRISM|assistant|Ask/i.test(await text(a)); await a.locator('div.fixed.z-\\[100\\] button[title="Close"]').first().click(); await a.waitForTimeout(600); say(open, 'C1.10', 'AI widget opens'); }
  else say(null, 'C1.10', 'AI widget button not found by selector');
  await a.locator('div.relative.ml-2 > button').first().click(); await a.getByText('Sign Out', { exact: true }).click();
  await a.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {}); say(a.url().includes('/login'), 'C1.11', 'Sign Out returns to /login');
  say(a.problems.filter(x => x.startsWith('PAGEERROR')).length === 0, 'C1.12', `shell page errors: ${a.problems.filter(x => x.startsWith('PAGEERROR')).join(' | ') || 'none'}`);
  await a.context().close();
}

// ── C2 layout 768 / 375 x light / dark ──
if (want('C2')) {
  const pages = { ADMIN: ['/', '/leads', '/orders', '/inventory', '/purchases', '/accounting', '/reports', '/sfa', '/distributors', '/settings', '/customers', '/schemes'],
    DISTRIBUTOR: ['/', '/orders', '/ledger', '/stock', '/price-list'], SALES_EXEC_1: ['/', '/sfa', '/leads'] };
  for (const [who, paths] of Object.entries(pages)) {
    const p = await login(who);
    for (const theme of ['light', 'dark']) {
      await p.evaluate(t => localStorage.setItem('prismora_theme', t), theme);
      for (const w of [768, 375]) {
        await p.setViewportSize({ width: w, height: 900 });
        for (const path of paths) {
          await go(p, path);
          const r = await p.evaluate(() => {
            const W = document.documentElement.clientWidth;
            const sw = document.documentElement.scrollWidth;
            const wide = [...document.querySelectorAll('body *')].filter(el => { const b = el.getBoundingClientRect(); if (b.width === 0) return false;
              let q = el.parentElement; while (q) { const s = getComputedStyle(q); if (/(auto|scroll|hidden)/.test(s.overflowX)) return false; q = q.parentElement; }
              return b.right > W + 2; }).slice(0, 3).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
            const bg = getComputedStyle(document.body).backgroundColor; const cls = document.documentElement.className;
            return { W, sw, wide, bg, cls };
          });
          const ok = r.sw <= r.W + 1;
          if (!ok || (theme === 'dark' && !/dark/.test(r.cls))) say(false, 'C2', `${who} ${path} ${w}px ${theme}: page ${r.sw}px wide in a ${r.W}px screen; sticking out: ${r.wide.join(', ') || '-'}; html class "${r.cls}"`);
          if ((path === '/' || path === '/orders') && w === 375) await p.screenshot({ path: `shots/${who}-${path.replace(/\//g, '_') || 'home'}-${w}-${theme}.png` });
        }
      }
    }
    say(null, 'C2', `${who}: ${paths.length} pages x 2 widths x 2 themes checked`);
    await p.context().close();
  }
}

// ── C3 Reports date filter (29 Sep 2026, a day with 4 tax invoices issued 00:24-00:35 IST) ──
if (want('C3')) {
  const ist = db(`SELECT count(*) FROM invoices WHERE "invoiceType"='tax_invoice' AND ("createdAt" AT TIME ZONE 'Asia/Kolkata')::date='2026-09-29'`)[0];
  const p = await login('ADMIN'); await go(p, '/reports');
  const dates = p.locator('input[type="date"]');
  await dates.nth(0).fill('2026-09-29'); await dates.nth(1).fill('2026-09-29'); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Financial', exact: true }).click(); await p.waitForTimeout(500);
  await p.getByText('Invoice Register', { exact: false }).first().click(); await settle(p);
  const shown = await p.locator('table tbody tr').count();
  const ids = (await text(p)).match(/INV-\d+/g) || [];
  say(String(shown) === ist, 'C3.1', `Invoice Register 29 Sep - 29 Sep: screen ${shown} rows, DB (India day) ${ist}; missing early-morning ones: ${['INV-1790621645160', 'INV-1790621954342', 'INV-1790621973293', 'INV-1790622335658'].filter(i => !ids.includes(i)).join(', ') || 'none'}`);
  await p.screenshot({ path: 'shots/C3-invoice-register-0929.png' });
  await p.context().close();
}

// ── C4 Dealer / Retailer Incentives + Stock pages ──
if (want('C4')) {
  for (const who of ['DEALER', 'RETAILER', 'DEALER_2', 'RETAILER_2']) {
    const p = await login(who);
    for (const path of ['/incentives', '/stock']) {
      await go(p, path); await p.waitForTimeout(4000);
      const t = await text(p);
      const stuck = /Loading(\.\.\.|…)/.test(t), denied = /Access Denied|Page not found/i.test(t) || p.url().includes('denied');
      const nums = (t.match(/(₹[\d,.]+|\b\d+ (units|deliveries|orders?)\b)/g) || []).slice(0, 6).join(' · ');
      say(!stuck && !denied && t.length > 100, 'C4', `${who} ${path}: ${stuck ? 'STILL LOADING' : denied ? 'DENIED' : 'loaded'}; figures: ${nums || '(none shown)'}`);
      await p.screenshot({ path: `shots/C4-${who}${path.replace('/', '-')}.png` });
    }
    const pe = p.problems.filter(x => /PAGEERROR|HTTP [45]/.test(x));
    if (pe.length) say(false, 'C4', `${who} problems: ${pe.slice(0, 4).join(' | ')}`);
    await p.context().close();
  }
}

// ── C5 charts read off the screen ──
if (want('C5')) {
  const exp = db(`SELECT s||'='||sum(value) FROM (SELECT coalesce(nullif(state,''),'Unknown') s, value FROM orders WHERE status<>'Cancelled') x GROUP BY s ORDER BY sum(value) DESC LIMIT 6`);
  const d = await login('DIRECTOR'); await go(d, '/');
  const card = d.locator('div', { has: d.locator('h3', { hasText: 'Top States' }) }).last();
  const bars = card.locator('.recharts-bar-rectangle');
  const seen = [];
  for (let i = 0; i < await bars.count(); i++) { await bars.nth(i).hover(); await d.waitForTimeout(400); const tt = await card.locator('.recharts-tooltip-wrapper').innerText().catch(() => ''); seen.push(tt.replace(/\s+/g, ' ').trim()); }
  say(null, 'C5.1', `Director Top States on screen: ${seen.join(' | ')}`);
  say(null, 'C5.1', `DB (non-cancelled order value by state): ${exp.join(' | ')}`);
  await d.context().close();
  const leadExp = db(`SELECT status||'='||count(*) FROM leads GROUP BY status ORDER BY 1`);
  const a = await login('ADMIN'); await go(a, '/');
  const pc = a.locator('div', { has: a.locator('h3', { hasText: 'Lead Status' }) }).last();
  const legend = (await pc.locator('.recharts-legend-item-text').allInnerTexts());
  const slices = pc.locator('.recharts-pie-sector'); const vals = [];
  for (let i = 0; i < await slices.count(); i++) { await slices.nth(i).hover({ force: true }); await a.waitForTimeout(400); vals.push((await pc.locator('.recharts-tooltip-wrapper').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()); }
  say(null, 'C5.2', `Admin Lead Status legend: ${legend.join(', ')}; slices: ${vals.join(' | ')}`);
  say(null, 'C5.2', `DB leads by status: ${leadExp.join(' | ')}`);
  await a.context().close();
}
await browser.close();
