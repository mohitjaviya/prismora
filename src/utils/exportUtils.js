import { notify } from './notify';

/**
 * Line items as one readable cell, a line each:
 * "Neem Wash × 10 @ 140 = 1400\nShampoo × 5".
 * A list of objects put straight into an export printed "[object Object]" (H14).
 * Reads order lines (name, unitPrice, total) and return lines (product,
 * unitCost). Gap 2: one cell, one line per item (no Product 1 / Product 2).
 */
export const itemsText = (items) => (Array.isArray(items) ? items : [])
  .map(i => {
    const name = i?.name || i?.product || '?';
    const price = i?.unitPrice ?? i?.unitCost;
    const total = i?.total ?? (price != null && i?.quantity != null ? Number(price) * Number(i.quantity) : null);
    return `${name} × ${i?.quantity ?? '?'}${price != null ? ` @ ${price}` : ''}${total != null ? ` = ${total}` : ''}`;
  })
  .join('\n');

// ── Gap 2: formatted .xlsx exports ────────────────────────────────────────
// Every export goes through downloadExcel(rows, fileName). Columns, their order
// and the file name come from the screen exactly as before; this part only
// decides how each value is written: ids as text, real dates, Indian amounts,
// blanks for "null"/"None", widths, wrapping, a frozen filtered header.

/** Placeholders the screens use for "nothing here"; all become a blank cell. */
const BLANK_TEXT = new Set(['', 'null', 'undefined', 'none', 'n/a', 'nan', '—', '-']);

export const isBlankValue = (v) =>
  v === null || v === undefined
  || (typeof v === 'number' && !Number.isFinite(v))
  || (typeof v === 'string' && BLANK_TEXT.has(v.trim().toLowerCase()));

// Identifiers stay text: no 9.87654E+09 phones, no lost leading zeros.
const ID_HEADER = /(^|[^a-z])ids?$|^id\b|phone|mobile|gstin|pin ?code|^pin$|sku|utr|reference|^ref$|hsn|batch|territory|^(po|grn|return|claim|incentive|order|invoice|lead|key|code|uom)$|(invoice|order|po|grn) ?(id|no|number)$/i;
const ID_HEADER_CAMEL = /[a-z]Ids?$|^(assignedTo|createdBy|managedUsers)$/; // territoryId, leadId — not "Paid"
export const isIdHeader = (h) => ID_HEADER.test(h) || ID_HEADER_CAMEL.test(h);

const COUNT_HEADER = /leads|orders|count|transactions|qty|quantity|resolved|converted|days|items|batches|reserved|transit|damaged|reorder|deficit|received|unconfirmed|free ?goods|^open$/i;
const MONEY_HEADER = /₹|amount|value|total|price|cost|outstanding|credit|debit|balance|revenue|spend|mrp|paid|due|subtotal|cgst|sgst|igst|tds|taxable|base|limit|min ?order|^(distributor|dealer|retailer)$/i;
const PERCENT_HEADER = /%|^gst$|discount|utili[sz]ation|margin|conv/i;
const LONG_HEADER = /note|address|description|resolution|reason|items|products|manages|remarks|comment/i;

/** What a plain number in this column means: an amount, a percentage or a count. */
export const numberKindFor = (header) => {
  if (/₹/.test(header)) return 'amount';
  if (PERCENT_HEADER.test(header)) return 'percent';
  if (COUNT_HEADER.test(header)) return 'number';
  if (MONEY_HEADER.test(header)) return 'amount';
  return 'number';
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Excel stores a date as a wall-clock serial with no zone, and ExcelJS turns a
// Date into that serial from its UTC fields; so the local (IST) wall-clock
// time is copied into a UTC date.
const wallClock = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
const plausible = (y) => y >= 1900 && y <= 2200;

/**
 * Reads the dates the screens hand over — Date objects, ISO dates and
 * timestamps, and formatDate's "4 Oct 2026" — into { date, time }.
 * Anything else is not a date (null).
 */
export const parseDateValue = (v) => {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return { date: wallClock(v), time: v.getHours() !== 0 || v.getMinutes() !== 0 };
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && plausible(+m[1])) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), time: false };
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime()) || !plausible(d.getFullYear())) return null;
    return { date: wallClock(d), time: true };
  }
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined && plausible(+m[3])) {
    return { date: new Date(Date.UTC(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1])), time: false };
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && plausible(+m[3])) return { date: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])), time: false };
  return null;
};

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
const decimalsOf = (n) => { const s = String(n); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(2, s.length - i - 1); };

/** Several values in one cell, a line each. */
const listText = (arr) => arr
  .filter(x => !isBlankValue(x))
  .map(x => (x && typeof x === 'object' ? (x.name || x.label || x.product || JSON.stringify(x)) : String(x)))
  .join('\n');

/**
 * One value → { kind, value }. kind: blank | text | id | date | datetime |
 * amount | number | percent. `numberKind` is the column's meaning for numbers.
 */
export const typeCell = (raw, { id = false, numberKind = 'number', numericText = false } = {}) => {
  if (isBlankValue(raw)) return { kind: 'blank', value: null };
  if (Array.isArray(raw)) {
    const t = listText(raw);
    return t ? { kind: id ? 'id' : 'text', value: t } : { kind: 'blank', value: null };
  }
  if (typeof raw === 'boolean') return { kind: 'text', value: raw ? 'Yes' : 'No' };
  if (id) return { kind: 'id', value: typeof raw === 'object' && !(raw instanceof Date) ? JSON.stringify(raw) : String(raw).trim() };
  if (typeof raw === 'number') {
    return numberKind === 'percent'
      ? { kind: 'percent', value: raw / 100, decimals: decimalsOf(raw) }
      : { kind: numberKind, value: raw, decimals: decimalsOf(raw) };
  }
  const d = parseDateValue(raw);
  if (d) return { kind: d.time ? 'datetime' : 'date', value: d.date };
  if (typeof raw === 'object') return { kind: 'text', value: JSON.stringify(raw) };
  const s = String(raw).trim();
  const pct = s.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (pct) return { kind: 'percent', value: Number(pct[1]) / 100, decimals: decimalsOf(pct[1]) };
  const money = s.match(/^(-?)\s*₹\s*(-?[\d,]+(?:\.\d+)?)$/);
  if (money) return { kind: 'amount', value: Number(`${money[1]}${money[2].replace(/,/g, '')}`), decimals: 2 };
  // "10" stored as text in a quantity or amount column is still a number;
  // elsewhere a string of digits may be a code, so it stays text.
  if (numericText && NUMERIC_TEXT.test(s)) return typeCell(Number(s), { numberKind });
  return { kind: 'text', value: s };
};

// Indian grouping (12,34,567.00) whatever the computer's region settings.
export const AMOUNT_FORMAT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
export const DATE_FORMAT = 'dd-mm-yyyy';
export const DATETIME_FORMAT = 'dd-mm-yyyy hh:mm';

const indian = (n, digits) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Characters the value takes on screen, for column widths. */
const shownLength = (c, numberDecimals) => {
  switch (c.kind) {
    case 'blank': return 0;
    case 'date': return 10;
    case 'datetime': return 16;
    case 'amount': return indian(c.value, 2).length;
    case 'number': return indian(c.value, numberDecimals).length;
    case 'percent': return String(Math.round(c.value * 10000) / 100).length + 1;
    default: return Math.max(...String(c.value).split('\n').map(l => l.length));
  }
};

export const WIDTH_MIN = 8;
export const WIDTH_MAX = 50;
const LINE_HEIGHT = 15;

/**
 * Builds the formatted sheet. Pure apart from the ExcelJS module it is given
 * (so tests can run it in Node). `types` may fix a column's number meaning:
 * { 'Total': 'number' }.
 */
export const buildWorkbook = (ExcelJS, data, sheetName, { types = {} } = {}) => {
  const headers = Object.keys(data[0]);
  const columns = headers.map(h => {
    const id = isIdHeader(h);
    const numberKind = types[h] || numberKindFor(h);
    const numericText = Boolean(types[h]) || /₹/.test(h) || PERCENT_HEADER.test(h) || COUNT_HEADER.test(h) || MONEY_HEADER.test(h);
    const cells = data.map(row => typeCell(row[h], { id, numberKind, numericText }));
    const numberDecimals = cells.some(c => c.kind === 'number' && c.decimals > 0) ? 2 : 0;
    const percentDecimals = Math.max(0, ...cells.filter(c => c.kind === 'percent').map(c => c.decimals));
    const longest = Math.max(0, ...cells.map(c => shownLength(c, numberDecimals)));
    const multiLine = cells.some(c => typeof c.value === 'string' && c.value.includes('\n'));
    const width = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, h.length + 4, longest + 2));
    const wrap = multiLine || longest + 2 > WIDTH_MAX || (LONG_HEADER.test(h) && longest > 30);
    return { h, cells, width, wrap, numberDecimals, percentDecimals };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PRISMORA';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }] });
  ws.columns = columns.map(c => ({ key: c.h, width: c.width }));

  const isRight = (kind) => kind === 'amount' || kind === 'number' || kind === 'percent' || kind === 'date' || kind === 'datetime';

  const header = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.h;
    const right = c.cells.some(x => isRight(x.kind)) && c.cells.every(x => x.kind === 'blank' || isRight(x.kind));
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    cell.alignment = { vertical: 'top', horizontal: right ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF8EA9C1' } } };
  });
  header.commit?.();

  data.forEach((_, r) => {
    const row = ws.getRow(r + 2);
    let lines = 1;
    columns.forEach((col, i) => {
      const c = col.cells[r];
      const cell = row.getCell(i + 1);
      cell.value = c.value;
      if (c.kind === 'id') cell.numFmt = '@';
      else if (c.kind === 'amount') cell.numFmt = AMOUNT_FORMAT;
      else if (c.kind === 'number') cell.numFmt = col.numberDecimals ? '#,##0.00' : '#,##0';
      else if (c.kind === 'percent') cell.numFmt = col.percentDecimals ? `0.${'0'.repeat(col.percentDecimals)}%` : '0%';
      else if (c.kind === 'date') cell.numFmt = DATE_FORMAT;
      else if (c.kind === 'datetime') cell.numFmt = DATETIME_FORMAT;
      cell.alignment = { vertical: 'top', horizontal: isRight(c.kind) ? 'right' : 'left', wrapText: col.wrap };
      if (col.wrap && typeof c.value === 'string') {
        // Excel does not grow a row for wrapped text in a file it opens, so the
        // height is set here: every line of every wrapped cell must show.
        const perLine = Math.max(1, col.width - 2);
        const n = c.value.split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / perLine)), 0);
        lines = Math.max(lines, n);
      }
    });
    if (lines > 1) row.height = Math.min(409, lines * LINE_HEIGHT);
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.length + 1, column: headers.length } };
  return wb;
};

/** Excel's sheet-name rules: ≤ 31 characters, none of []:*?/\ . */
export const sheetNameFor = (filename) =>
  (String(filename || 'Export').replace(/^PRISMORA_/, '').replace(/[[\]:*?/\\]/g, ' ').replace(/_/g, ' ').trim() || 'Export').slice(0, 31);

/**
 * Downloads `data` (rows of { Column: value }) as `${filename}.xlsx`.
 * ExcelJS (~250 KB gzipped) is fetched only when Export is pressed.
 */
export const downloadExcel = async (data, filename, options) => {
  if (!data || !data.length) {
    // A toast, not the browser's blocking alert().
    notify('Nothing to export: the list is empty.');
    return;
  }
  try {
    const mod = await import('exceljs');
    const ExcelJS = mod.default || mod;
    const wb = buildWorkbook(ExcelJS, data, sheetNameFor(filename), options);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${filename}.xlsx`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  } catch (e) {
    console.error('Export failed', e);
    notify('The export could not be created. Please try again.');
  }
};
