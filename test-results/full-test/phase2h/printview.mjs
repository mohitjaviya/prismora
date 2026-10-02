import { browser, login, go, E } from './glib.mjs';
import { as } from './rest-as.mjs';
import { writeFileSync } from 'node:fs';
const SA = await as('SUPER_ADMIN');
const inv = (await SA('invoices?select=*', { headers: { Range: '0-999' } })).body;
const byId = Object.fromEntries(inv.map(i => [i.id, i]));
const p = await login(E.TEST_SUPER_ADMIN_EMAIL, E.TEST_SUPER_ADMIN_PASSWORD);
await go(p, '/accounting');
await p.click('button:has-text("Invoices (")'); await p.waitForTimeout(800);
const N = (s) => Number(String(s).replace(/[₹,\s]/g, ''));
const lab = (t, re) => { const m = t.match(re); return m ? N(m[1]) : 0; };
for (let q = 0; q < Number(process.env.PG || 0); q++) { await p.click('button[aria-label="Next page"]'); await p.waitForTimeout(500); }
const count = await p.$$eval('button[title^="Print"]', els => els.length);
console.log('print buttons', count);
const out = [];
for (let k = 0; k < count; k++) {
  try { await (await p.$$('button[title^="Print"]'))[k].click({ timeout: 8000 }); } catch (e) { out.push({ id: 'click-failed-' + k, found: false, bad: [String(e).slice(0, 80)] }); await p.keyboard.press('Escape'); await p.waitForTimeout(500); continue; } await p.waitForTimeout(350);
  const t = await p.innerText('#printable-invoice-container');
  const id = (t.match(/INV-\d+/) || [])[0]; const d = byId[id];
  const row = { id, found: !!d, bad: [] };
  if (d) {
    row.type = d.invoiceType;
    const got = {
      base: lab(t, /(?:Total Taxable Value \(Base\)|Subtotal):\s*\n\s*₹?([\d,.\-]+)/),
      cgst: lab(t, /Central Tax \(CGST\):\s*\n\s*₹?([\d,.\-]+)/),
      sgst: lab(t, /State Tax \(SGST\):\s*\n\s*₹?([\d,.\-]+)/),
      igst: lab(t, /Integrated Tax \(IGST\):\s*\n\s*₹?([\d,.\-]+)/),
      grand: lab(t, /(?:Grand Total|Amount due \(no GST\)):\s*\n\s*₹?([\d,.\-]+)/),
    };
    const exp = { base: Number(d.amount), cgst: Number(d.cgst || 0), sgst: Number(d.sgst || 0), igst: Number(d.igst || 0), grand: Number(d.amount) + Number(d.tax) };
    for (const k2 of Object.keys(exp)) if (Math.abs(got[k2] - exp[k2]) > 0.51) row.bad.push(`${k2}: print=${got[k2]} db=${exp[k2]}`);
    const ls = [...t.matchAll(/(?:^|\n)\d+\t[^\n]*\t₹([\d,.]+)(?=\n)/g)].map(m => N(m[1])).reduce((a, b) => a + b, 0);
    if (ls && Math.abs(ls - exp.base) > 0.51) row.bad.push(`line items sum ${ls} vs base ${exp.base}`);
    const pos = (t.match(/Place of Supply: ([^(\n]+)/) || [])[1];
    if (pos && d.placeOfSupply && pos.trim() !== d.placeOfSupply) row.bad.push(`place of supply print=${pos.trim()} db=${d.placeOfSupply}`);
    if (!t.includes(d.invoiceType === 'auto_draft' ? 'PROFORMA INVOICE' : 'TAX INVOICE')) row.bad.push('wrong title for type ' + d.invoiceType);
    row.words = (t.match(/AMOUNT IN WORDS:\s*\n+\s*([^\n]+)/i) || [])[1] || ''; row.grand = exp.grand; row.got = got;
  }
  out.push(row);
  await p.click('.no-print button:last-child').catch(() => {}); await p.waitForTimeout(200);
}
writeFileSync('print-res-' + (process.env.PG || 0) + '.json', JSON.stringify(out, null, 1));
console.log('checked', out.length, 'notfound', out.filter(o => !o.found).length, 'with problems', out.filter(o => o.bad.length).length, 'distinct ids', new Set(out.map(o => o.id)).size);
for (const o of out.filter(o => o.bad.length || !o.found)) console.log(o.id, o.type, JSON.stringify(o.bad));
await browser.close();
