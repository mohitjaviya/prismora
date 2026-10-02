import { readFileSync } from 'node:fs';
const a = ['print-res.json', 'print-res-1.json', 'print-res-2.json'].flatMap(f => JSON.parse(readFileSync(f, 'utf8')));
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
const words = (n) => { // Indian system, integer rupees
  const parts = []; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1000); n %= 1000; const h = Math.floor(n / 100); n %= 100;
  if (cr) parts.push(two(cr) + ' Crore'); if (lk) parts.push(two(lk) + ' Lakh'); if (th) parts.push(two(th) + ' Thousand'); if (h) parts.push(ones[h] + ' Hundred');
  if (n) parts.push((parts.length ? 'and ' : '') + two(n));
  return parts.join(' ');
};
const ids = new Set(a.map(o => o.id));
console.log('rows', a.length, 'distinct', ids.size, 'problems', a.filter(o => o.bad.length).length);
let bad = 0;
for (const o of a) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const w = o.words || '';
  const exp = words(Math.round(o.grand));
  if (!norm(w).includes(norm(exp)) || (o.grand % 1 !== 0 && !/paise/i.test(w))) { bad++; console.log('WORDS', o.id, o.grand, '|', w, '| expected ~', exp); }
}
console.log('words mismatches', bad);
