// Gap 14 layout check: read-only (no clicks that save). Local dev server.
// For each list page and viewport: does the window scroll, does the table
// body scroll, does the header row stay put after scrolling, is any row
// action under the AI button, is the "Add Order" button inside the screen.
import { login, go, browser } from '../phase3/lib.mjs';

const sizes = [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [375, 812]];
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
        const visibleRows = rows.filter(tr => { const b = tr.getBoundingClientRect(); return b.top >= 0 && b.bottom <= vh; }).length;
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
        return { rows: rows.length, visibleRows, outerScrolls, innerScrolls, headStays, covered, pagerCovered, pageOverflowX, addInside, hasAI: !!ai };
      });
      const tag = `${role} ${path} ${w}x${h}`;
      const fillPage = path !== '/distributors';
      if (w >= 1024 && fillPage) {
        out(!r.outerScrolls, `${tag}: window does not scroll (rows in view at load: ${r.visibleRows}/${r.rows})`);
        if (r.innerScrolls) out(r.headStays, `${tag}: only rows scroll, header row stays`);
        else console.log('INFO', `${tag}: all rows fit, nothing to scroll`);
      } else {
        console.log('INFO', `${tag}: normal page scroll (window scrolls: ${r.outerScrolls}), rows in view ${r.visibleRows}/${r.rows}`);
      }
      out(!r.covered && !r.pagerCovered, `${tag}: AI button (${r.hasAI ? 'shown' : 'not shown'}) covers no last-row action or pager`);
      out(!r.pageOverflowX && r.addInside, `${tag}: no sideways page scroll, header buttons on screen`);
    }
  }
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
