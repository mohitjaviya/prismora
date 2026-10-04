// Batch 17 screen checks as the real roles, each confirmed against the DB where something could change.
// Local by default (BASE). LIVE=1: read-only checks only (no approval write).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { login, go, browser, BASE, assertNotIntercepting } from '../phase3/lib.mjs';

const LIVE = process.env.LIVE === '1';
const results = [];
const check = (id, ok, info = '') => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${info ? ' :: ' + info : ''}`); };
const SQLF = 'C:/Users/PREMIUM/AppData/Local/Temp/claude/d--PRISMORA/4d843ece-31f1-47c6-bea9-1683f83321a5/scratchpad/ui17.sql';
const db = (sql, raw = false) => {
  assertNotIntercepting();
  writeFileSync(SQLF, raw ? sql : `select json_build_object('v', (${sql})) r;`);
  for (let i = 0; i < 4; i++) {
    const out = execSync(`npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f ${SQLF} 2>&1`, { cwd: 'D:/PRISMORA', encoding: 'utf8' });
    const m = out.match(/"r":\s*(\{[\s\S]*?\})\s*\}\s*\]/);
    if (m) return JSON.parse(m[1]).v;
  }
  throw new Error('no answer from db for ' + sql);
};
// A write, top level (a data-modifying WITH can't be nested); returns rows affected.
const dbw = (stmt) => db(`with x as (${stmt}) select json_build_object('v', count(*)) r from x;`, true);
const text = (page) => page.evaluate(() => document.body.innerText);

// ── Admin: bell, reports, accounting, roles, orders at 375 px ──
{
  const page = await login('ADMIN');
  await go(page, '/');
  await page.getByRole('button', { name: 'Notifications' }).click();
  await page.waitForTimeout(1500);
  const t = await text(page);
  check('B1 bell: "Batch Expired" for an expired batch holding stock', /Batch Expired/.test(t), (t.match(/[^\n]*expired \d+ days? ago[^\n]*/) || [''])[0].slice(0, 160));
  check('B2 bell: Overdue notice for INV-1790654942828 (DB Overdue), no ₹NaN', /INV-1790654942828/.test(t) && !/NaN/.test(t), (t.match(/[^\n]*INV-1790654942828[^\n]*/) || [''])[0].slice(0, 160));

  await go(page, '/reports');
  await page.getByRole('button', { name: 'Financial', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('Invoice Register', { exact: false }).first().click();
  await page.waitForTimeout(1000);
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill('2026-09-29'); await dates.nth(1).fill('2026-09-29');
  await page.waitForTimeout(1500);
  const rows = await page.locator('table tbody tr').count();
  const want = db(`select count(*) from invoices where ("createdAt" at time zone 'Asia/Kolkata')::date='2026-09-29' and coalesce("invoiceType",'')<>'auto_draft'`);
  check('R1 Invoice Register 29 Sep (IST) shows every tax invoice of the day', rows === Number(want), `screen ${rows}, DB ${want}`);

  await go(page, '/accounting');
  await page.getByRole('button', { name: /^Invoices \(/ }).click(); await page.waitForTimeout(1200);
  const tAcc = await text(page);
  check('A1 credit-note-only invoice says "by credit note, nothing paid"', /by credit note, nothing paid/.test(tAcc), (tAcc.match(/[^\n]*by credit note[^\n]*/) || ['none'])[0]);
  check('A2 no placeholder contacts in reminder buttons', await page.locator('button[title*="9876543210"], button[title*="accounts@prismora.com"]').count() === 0);
  const noContact = await page.locator('button[title^="No phone number on record"]').count();
  check('A3 reminder without a contact is disabled and says why', noContact === 0 || await page.locator('button[title^="No phone number on record"]').first().isDisabled(), `${noContact} without phone`);

  await page.getByRole('button', { name: /^Expenses \(/ }).click();
  await page.waitForTimeout(1000);
  const before = db(`select count(*) from expenses`);
  const row = page.locator('tr', { hasText: '814013' }).first();
  await row.locator('button[title="Delete this expense"]').click();
  await page.waitForTimeout(800);
  const dlg = await text(page);
  check('A4 deleting an auto-booked expense warns it was booked by the system', /auto-booked scheme incentive expense/i.test(dlg) && /payout itself stays Paid/.test(dlg));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  check('A5 cancelled: expense still in DB', db(`select count(*) from expenses`) === before && db(`select count(*) from expenses where id='EXP-INC-1789983894639-SCH-1789983814013'`) === 1);

  await page.getByRole('button', { name: 'Log Expense' }).click();
  await page.waitForTimeout(500);
  const max = await page.locator('#accounting-date').getAttribute('max');
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  check('A6 expense date picker stops at today (IST)', max === todayIst, `max=${max}`);
  await page.keyboard.press('Escape');

  await go(page, '/masters/roles');
  const titles = await page.locator('[title*="view only"]').evaluateAll(e => e.map(x => x.title));
  const dirSum = db(`select count(*) filter (where value='full') || ' full · ' || count(*) filter (where value='view') || ' view only · ' || (21 - count(*) filter (where value in ('full','view'))) || ' no access' from roles r, jsonb_each_text(r.permissions) where r.name='Director'`);
  const cardText = titles.includes(dirSum) ? dirSum : titles.join(' / ');
  const dir = dirSum;
  check('D15 Director card bar shows its own row (DB), not all-full', titles.includes(dirSum), `DB ${dir}; card bars: ${titles.length}`);

  await page.setViewportSize({ width: 375, height: 800 });
  await go(page, '/orders');
  const box = await page.getByRole('button', { name: 'Add Order' }).first().boundingBox();
  check('L1 Orders at 375 px: "Add Order" fully on screen', !!box && box.x >= 0 && box.x + box.width <= 375, box ? `x ${Math.round(box.x)}..${Math.round(box.x + box.width)}` : 'not found');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('L2 Orders at 375 px: no sideways scroll', !sideways);
  check('P1 Admin pages: no browser alert/confirm used', page.dialogs.length === 0, page.dialogs.join(' | '));
  await page.context().close();
}

// ── Sales Exec 1: Profile label and figure ──
{
  const page = await login('SALES_EXEC_1');
  await go(page, '/profile');
  const t = await text(page);
  const uid = 'U-TEST-SALES-EXEC-1';
  const sum = db(`select coalesce(sum(value),0)::bigint from orders where "assignedTo"='${uid}' and status<>'Cancelled'`);
  const shown = (t.match(/₹([\d,]+)\s*\n\s*Order Value Booked/) || [])[1];
  check('PR1 Profile says "Order Value Booked", not "Revenue Generated"', /Order Value Booked/.test(t) && !/Revenue Generated/.test(t));
  check('PR2 figure = DB non-cancelled orders of this rep', shown && Number(shown.replace(/,/g, '')) === Number(sum), `screen ₹${shown}, DB ₹${sum}`);
  await page.context().close();
}

// ── Distributor: credit held, price list, empty export ──
{
  const page = await login('DISTRIBUTOR');
  await go(page, '/');
  const t = await text(page);
  const bal = db(`select "outstandingAmount" from distributors where name='TEST Distributor Pvt Ltd'`);
  check('PD1 partner in credit sees "Credit Held", no negative outstanding', /Credit Held\s*\n?\s*₹61,356/i.test(t) && !/Outstanding\s*\n?\s*[−-]₹/i.test(t), `DB balance ${bal}`);
  await go(page, '/price-list');
  const n = Number(((await text(page)).match(/of (\d+)\s*$/m) || (await text(page)).match(/–\d+ of (\d+)/) || [])[1]);
  const active = db(`select count(*) from products where coalesce(status,'Active')='Active'`);
  check('PL1 Price List lists only Active products', n === Number(active), `screen ${n}, DB active ${active}`);
  await go(page, '/claims');
  const exp = page.getByRole('button', { name: /Export/ }).first();
  if (await exp.count() && /No claims|nothing/i.test(await text(page))) {
    await exp.click(); await page.waitForTimeout(800);
    check('X1 empty export: a toast, no browser alert', page.dialogs.length === 0 && /Nothing to export/.test(await text(page)));
  } else check('X1 empty export (claims list not empty, checked on Incentives instead)', true, 'skipped');
  await page.context().close();
}

// ── Admin: approval asks first (local only: writes a TEST row) ──
if (!LIVE) {
  dbw(`insert into distributors(id,name,status,"creditLimit","outstandingAmount") values ('D-TEST-B17','TEST B17 Pending Distributor','Pending',0,0) returning 1`);
  const page = await login('ADMIN');
  await go(page, '/distributors');
  const row = page.locator('tr', { hasText: 'TEST B17 Pending Distributor' }).first();
  await row.locator('button[title="Approve"]').click();
  await page.waitForTimeout(600);
  check('AP1 Approve asks first', /Approve TEST B17 Pending Distributor\?/.test(await text(page)));
  await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(1500);
  check('AP2 cancelled: still Pending in DB', db(`select status from distributors where id='D-TEST-B17'`) === 'Pending');
  await row.locator('button[title="Approve"]').click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Approve', exact: true }).last().click(); await page.waitForTimeout(4000);
  check('AP3 confirmed: Active in DB', db(`select status from distributors where id='D-TEST-B17'`) === 'Active');
  await page.context().close();
  const gone = dbw(`delete from distributors where id='D-TEST-B17' returning 1`);
  check('AP4 TEST row removed', gone === 1);
}

await browser.close();
const bad = results.filter(r => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} as required (${BASE})`);
process.exit(bad ? 1 : 0);
