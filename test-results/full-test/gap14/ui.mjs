// Gap 14 (final direction: pages scroll like Leads). Read-only, local dev.
// Per page and size: no inner table scroll box; page-number footer right after
// the last row; header row sticks under the top bar while the page scrolls
// (when the table fits its card); at the end of the page the AI button covers
// neither the last row's buttons nor the footer; nothing runs off the side.
import { login, go, browser } from '../phase3/lib.mjs';

const sizes = [[1920, 1080], [1920, 825], [1366, 768], [1024, 768], [768, 1024], [375, 812]];
const pages = {
  ADMIN: ['/orders', '/customers', '/distributors', '/leads'],
  DISTRIBUTOR: ['/orders', '/price-list'],
};
let fails = 0;
const out = (ok, msg) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', msg); };

for (const [role, paths] of Object.entries(pages)) {
  const page = await login(role);
  for (const path of paths) {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, path);
      const tag = `${role} ${path} ${w}x${h}`;
      if (path === '/leads') {
        // Leads: the list view's Follow Up column says "—", never "None"
        const r = await page.evaluate(() => {
          const t = [...document.querySelectorAll('main table')].find(t => /Follow Up/i.test(t.tHead?.innerText || ''));
          if (!t) return null;
          const i = [...t.tHead.rows[0].cells].findIndex(c => /Follow Up/i.test(c.innerText));
          return [...t.tBodies[0].rows].map(r => r.cells[i]?.innerText.trim());
        });
        if (r === null) { console.log('INFO', `${tag}: no list table on screen`); continue; }
        out(!r.includes('None'), `${tag}: Follow Up shows no "None" (${r.filter(x => x === '—').length} dashes of ${r.length})`);
        break;                                   // one size is enough for this
      }
      const r = await page.evaluate(async () => {
        const sc = document.querySelector('main').parentElement;
        const topbar = sc.querySelector('header');
        const table = document.querySelector('main table');
        if (!table) return null;
        const box = table.parentElement, thead = table.tHead;
        const rows = [...table.tBodies[0].rows];
        const pager = document.querySelector('main button[aria-label="Next page"]')?.closest('div.border-t');
        const innerScroll = box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY !== 'visible';
        const last = rows[rows.length - 1].getBoundingClientRect();
        const footerAfterLast = pager ? pager.getBoundingClientRect().top >= last.bottom - 1 : null;
        const sticky = getComputedStyle(thead).position === 'sticky';
        // scroll the page so the table's middle is at the top
        sc.scrollTop = table.getBoundingClientRect().top + sc.scrollTop + table.offsetHeight / 2 - 100;
        await new Promise(r => setTimeout(r, 150));
        const headTop = thead.getBoundingClientRect().top, barBottom = topbar.getBoundingClientRect().bottom;
        const headStuck = Math.abs(headTop - barBottom) <= 2;
        // end of page
        sc.scrollTop = sc.scrollHeight;
        await new Promise(r => setTimeout(r, 150));
        const ai = document.querySelector('button[title="AI Assistant"]')?.getBoundingClientRect();
        const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const lastBtns = [...rows[rows.length - 1].querySelectorAll('button')].map(b => b.getBoundingClientRect());
        const covered = ai ? (lastBtns.some(b => ov(b, ai)) || (pager && [...pager.querySelectorAll('button, select')].some(b => ov(b.getBoundingClientRect(), ai)))) : false;
        const lastRowCovered = ai ? ov(rows[rows.length - 1].getBoundingClientRect(), ai) : false;
        return {
          rows: rows.length, innerScroll, footerAfterLast, sticky, headStuck, headTop: Math.round(headTop), barBottom: Math.round(barBottom),
          covered, lastRowCovered, hasAI: !!ai, pageScrolls: sc.scrollHeight > sc.clientHeight + 1,
          overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });
      if (!r) { console.log('INFO', `${tag}: no rows`); continue; }
      out(!r.innerScroll, `${tag}: no inner table scroll box (page scrolls: ${r.pageScrolls})`);
      if (r.footerAfterLast !== null) out(r.footerAfterLast, `${tag}: page-number footer right after the last of ${r.rows} rows`);
      if (r.sticky) out(r.headStuck, `${tag}: header row stuck under the top bar (head ${r.headTop}, bar ${r.barBottom})`);
      else console.log('INFO', `${tag}: table wider than its card, header scrolls with the page`);
      out(!r.covered && !r.lastRowCovered, `${tag}: at the end, AI button (${r.hasAI ? 'shown' : 'not shown'}) covers no last row / footer`);
      out(!r.overflowX, `${tag}: no sideways page scroll`);
    }
  }
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
