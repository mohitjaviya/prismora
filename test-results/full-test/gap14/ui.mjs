// Gap 14 layout check: read-only (no clicks that save). Local dev server.
// For each list page and viewport: does the window scroll, does the table
// body scroll, does the header row stay put after scrolling, is any row
// action under the AI button, is the "Add Order" button inside the screen.
import { login, go, browser } from '../phase3/lib.mjs';

// 1536x660 = a 1920x825 window at 125% Windows scaling (what the owner saw)
const sizes = [[1920, 1080], [1920, 825], [1536, 660], [1366, 768], [1024, 768], [768, 1024], [375, 812]];
const pages = {
  ADMIN: ['/orders', '/customers', '/distributors'],
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
      const r = await page.evaluate(() => {
        const main = document.querySelector('main')?.parentElement;     // Layout's scroller
        const table = document.querySelector('main table');
        const box = table?.parentElement;                               // DataTable's scroll box
        const thead = table?.querySelector('thead');
        const rows = table ? [...table.querySelectorAll('tbody tr')] : [];
        const vh = window.innerHeight;
        // fully visible: inside the window and inside the table's own scroll box
        const clip = box ? box.getBoundingClientRect() : { top: 0, bottom: vh };
        const visibleRows = rows.filter(tr => { const b = tr.getBoundingClientRect(); return b.top >= Math.max(0, clip.top) && b.bottom <= Math.min(vh, clip.bottom) + 0.5; }).length;
        const card = table?.closest('.glass-panel');
        const gapBelow = card ? Math.round(vh - card.getBoundingClientRect().bottom) : null;
        const outerScrolls = main ? main.scrollHeight > main.clientHeight + 1 : null;
        const innerScrolls = box ? box.scrollHeight > box.clientHeight + 1 : false;
        let headStays = null;
        if (innerScrolls) {
          const before = thead.getBoundingClientRect().top;
          box.scrollTop = box.scrollHeight;
          headStays = Math.abs(thead.getBoundingClientRect().top - before) < 1;
        }
        // AI button vs every row's action buttons, after scrolling to the end
        if (main) main.scrollTop = main.scrollHeight;
        if (box) box.scrollTop = box.scrollHeight;
        const ai = document.querySelector('button[title="AI Assistant"]')?.getBoundingClientRect();
        const lastRow = rows[rows.length - 1];
        const lastBtns = lastRow ? [...lastRow.querySelectorAll('button')].map(b => b.getBoundingClientRect()) : [];
        const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const covered = ai ? lastBtns.some(b => overlap(b, ai)) : false;
        const pager = [...document.querySelectorAll('main button[aria-label="Next page"]')].map(b => b.getBoundingClientRect());
        const pagerCovered = ai ? pager.some(b => overlap(b, ai)) : false;
        const pageOverflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
        const add = [...document.querySelectorAll('main button')].find(b => /Add Order|Place New Order|Export/.test(b.textContent));
        const addInside = add ? add.getBoundingClientRect().right <= window.innerWidth : true;
        return { rows: rows.length, visibleRows, gapBelow, outerScrolls, innerScrolls, headStays, covered, pagerCovered, pageOverflowX, addInside, hasAI: !!ai };
      });
      const tag = `${role} ${path} ${w}x${h}`;
      const fillPage = path !== '/distributors';
      if (w >= 1024 && fillPage) {
        out(!r.outerScrolls, `${tag}: window does not scroll (rows in view at load: ${r.visibleRows}/${r.rows})`);
        if (r.rows > 10) out(r.gapBelow >= 0 && r.gapBelow <= 30, `${tag}: card reaches the bottom (gap ${r.gapBelow}px)`);
        if (r.innerScrolls) out(r.headStays, `${tag}: only rows scroll, header row stays`);
        else console.log('INFO', `${tag}: all rows fit, nothing to scroll`);
      } else {
        console.log('INFO', `${tag}: normal page scroll (window scrolls: ${r.outerScrolls}), rows in view ${r.visibleRows}/${r.rows}`);
      }
      out(!r.covered && !r.pagerCovered, `${tag}: AI button (${r.hasAI ? 'shown' : 'not shown'}) covers no last-row action or pager`);
      out(!r.pageOverflowX && r.addInside, `${tag}: no sideways page scroll, header buttons on screen`);
    }
  }
  if (role === 'ADMIN') {
    // resize without reloading: the card must follow the window
    await page.setViewportSize({ width: 1920, height: 1080 });
    await go(page, '/orders');
    for (const [w, h] of [[1366, 768], [1920, 825], [1536, 660], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const sc = document.querySelector('main').parentElement;
        const card = document.querySelector('main table').closest('.glass-panel');
        return { gap: Math.round(innerHeight - card.getBoundingClientRect().bottom), outer: sc.scrollHeight > sc.clientHeight + 1 };
      });
      out(!r.outer && r.gap >= 0 && r.gap <= 30, `ADMIN /orders resized to ${w}x${h} without reload: card gap ${r.gap}px, window scrolls ${r.outer}`);
    }
  }
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
