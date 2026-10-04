import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  itemsText, isBlankValue, isIdHeader, numberKindFor, parseDateValue, typeCell,
  buildWorkbook, sheetNameFor, AMOUNT_FORMAT, DATE_FORMAT, DATETIME_FORMAT, WIDTH_MAX,
} from '../exportUtils';

describe('itemsText (H14)', () => {
  it('writes order lines readably instead of [object Object], one line each (Gap 2)', () => {
    expect(itemsText([
      { name: 'TEST Neem Face Wash 100ml', quantity: 10, unitPrice: 140, total: 1400 },
      { name: 'TEST Herbal Shampoo 200ml', quantity: 5, unitPrice: 232, total: 1160 },
    ])).toBe('TEST Neem Face Wash 100ml × 10 @ 140 = 1400\nTEST Herbal Shampoo 200ml × 5 @ 232 = 1160');
  });
  it('reads purchase-return lines (product, unitCost)', () => {
    expect(itemsText([{ product: 'Aloe Gel', quantity: 3, unitCost: 50 }])).toBe('Aloe Gel × 3 @ 50 = 150');
  });
  it('is empty for no items', () => {
    expect(itemsText(null)).toBe('');
    expect(itemsText([])).toBe('');
  });
});

describe('Gap 2: cell typing', () => {
  it('treats null / undefined / "null" / "None" / "N/A" as blank', () => {
    for (const v of [null, undefined, 'null', 'None', 'none', 'undefined', 'N/A', '', '  ', NaN, '—']) {
      expect(isBlankValue(v)).toBe(true);
    }
    expect(isBlankValue(0)).toBe(false);
    expect(isBlankValue('Unassigned')).toBe(false);
  });

  it('recognises identifier columns, not "Paid" or "Orders"', () => {
    for (const h of ['ID', 'id', 'Invoice ID', 'Phone', 'phone', 'GSTIN', 'pincode', 'SKU', 'HSN', 'HSN Code', 'Batch', 'PO', 'GRN', 'Order', 'Reference', 'territoryId', 'leadId', 'assignedTo', 'Key']) {
      expect(isIdHeader(h), h).toBe(true);
    }
    for (const h of ['Paid', 'Orders', 'TotalOrders', 'Name', 'Value', 'Status', 'Received (₹)']) {
      expect(isIdHeader(h), h).toBe(false);
    }
  });

  it('gives numbers a meaning from the header', () => {
    expect(numberKindFor('Outstanding')).toBe('amount');
    expect(numberKindFor('Total (₹)')).toBe('amount');
    expect(numberKindFor('Received (₹)')).toBe('amount');
    expect(numberKindFor('Total')).toBe('amount');
    expect(numberKindFor('Total Leads')).toBe('number');
    expect(numberKindFor('Qty')).toBe('number');
    expect(numberKindFor('Received')).toBe('number');
    expect(numberKindFor('GST %')).toBe('percent');
    expect(numberKindFor('Discount')).toBe('percent');
  });

  it('reads the dates the screens produce', () => {
    expect(parseDateValue('2026-10-04')).toEqual({ date: new Date(Date.UTC(2026, 9, 4)), time: false });
    expect(parseDateValue('4 Oct 2026')).toEqual({ date: new Date(Date.UTC(2026, 9, 4)), time: false });
    expect(parseDateValue('4 Sept 2026')).toEqual({ date: new Date(Date.UTC(2026, 8, 4)), time: false });
    expect(parseDateValue('04-10-2026')).toEqual({ date: new Date(Date.UTC(2026, 9, 4)), time: false });
    const ts = parseDateValue('2026-10-04T10:15:00');
    expect(ts.time).toBe(true);
    expect(ts.date.toISOString()).toBe('2026-10-04T10:15:00.000Z'); // local wall clock kept
    expect(parseDateValue('Oct 2026')).toBe(null);
    expect(parseDateValue('9876543210')).toBe(null);
  });

  it('keeps identifiers as exact text', () => {
    expect(typeCell(9876543210, { id: true })).toEqual({ kind: 'id', value: '9876543210' });
    expect(typeCell('012345', { id: true })).toEqual({ kind: 'id', value: '012345' });
    expect(typeCell('2026-10-04', { id: true }).kind).toBe('id');
  });

  it('turns "%" and "₹" text into numbers, and lists into lines', () => {
    expect(typeCell('12.5%')).toMatchObject({ kind: 'percent', value: 0.125, decimals: 1 });
    expect(typeCell(18, { numberKind: 'percent' })).toMatchObject({ kind: 'percent', value: 0.18 });
    expect(typeCell('₹1,23,456.50')).toMatchObject({ kind: 'amount', value: 123456.5 });
    expect(typeCell(['A', null, 'B'])).toEqual({ kind: 'text', value: 'A\nB' });
    expect(typeCell([])).toEqual({ kind: 'blank', value: null });
    expect(typeCell('10', { numberKind: 'number', numericText: true })).toMatchObject({ kind: 'number', value: 10 });
    expect(typeCell('10')).toEqual({ kind: 'text', value: '10' });
  });

  it('names the sheet within Excel\'s rules', () => {
    expect(sheetNameFor('PRISMORA_Leads')).toBe('Leads');
    expect(sheetNameFor('PRISMORA_GST_/_HSN_Summary_(GSTR-1)').length).toBeLessThanOrEqual(31);
    expect(sheetNameFor('PRISMORA_GST_/_HSN_Summary_(GSTR-1)')).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe('Gap 2: the workbook (written and read back)', () => {
  const rows = [
    { ID: 'L1', Phone: '09876543210', GSTIN: '27ABCDE1234F1Z5', pincode: 411001, Name: 'TEST Lead', Outstanding: 1234567.5, Qty: 10, 'GST %': 18, followUpDate: '2026-10-04', createdAt: '2026-10-04T10:15:00', Notes: 'x'.repeat(120), Items: 'A × 1\nB × 2\nC × 3' },
    { ID: 'L2', Phone: null, GSTIN: 'None', pincode: 'null', Name: 'TEST Two', Outstanding: -500, Qty: 2, 'GST %': 5, followUpDate: null, createdAt: undefined, Notes: '', Items: '' },
  ];

  const roundTrip = async () => {
    const wb = buildWorkbook(ExcelJS, rows, 'Leads');
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    return back.getWorksheet('Leads');
  };

  it('has a bold, filled, frozen, filtered header with the same columns in order', async () => {
    const ws = await roundTrip();
    expect(ws.getRow(1).values.slice(1)).toEqual(Object.keys(rows[0]));
    expect(ws.getCell('A1').font.bold).toBe(true);
    expect(ws.getCell('A1').fill.fgColor.argb).toBe('FFDCE6F1');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.rowCount).toBe(rows.length + 1);
    expect(ws.columnCount).toBe(Object.keys(rows[0]).length);
  });

  it('writes ids as text, real dates, Indian amounts, percentages and blanks', async () => {
    const ws = await roundTrip();
    const c = (col, r = 2) => ws.getRow(r).getCell(Object.keys(rows[0]).indexOf(col) + 1);
    expect(c('Phone').value).toBe('09876543210');
    expect(c('Phone').numFmt).toBe('@');
    expect(c('pincode').value).toBe('411001');
    expect(c('Outstanding').value).toBe(1234567.5);
    // styles.xml holds AMOUNT_FORMAT with its "\," escapes; ExcelJS's reader drops them.
    expect(c('Outstanding').numFmt).toBe(AMOUNT_FORMAT.replace(/\\/g, ''));
    expect(c('Outstanding').alignment.horizontal).toBe('right');
    expect(c('Qty').numFmt).toBe('#,##0');
    expect(c('GST %').value).toBe(0.18);
    expect(c('GST %').numFmt).toBe('0%');
    expect(c('followUpDate').value).toBeInstanceOf(Date);
    expect(c('followUpDate').numFmt).toBe(DATE_FORMAT);
    expect(c('createdAt').numFmt).toBe(DATETIME_FORMAT);
    expect(c('Name').alignment).toMatchObject({ horizontal: 'left', vertical: 'top' });
    for (const col of ['Phone', 'GSTIN', 'pincode', 'followUpDate', 'createdAt', 'Notes', 'Items']) {
      expect(c(col, 3).value ?? null, col).toBe(null);
    }
  });

  it('sizes columns within limits and wraps long or multi-line text with a taller row', async () => {
    // Widths from the sheet as built: the writer merges equal neighbours into
    // one <col> range, which ExcelJS's own reader then loses.
    const built = buildWorkbook(ExcelJS, rows, 'Leads').getWorksheet('Leads');
    const widths = Object.keys(rows[0]).map((_, i) => built.getColumn(i + 1).width);
    const ws = built;
    widths.forEach(w => { expect(w).toBeGreaterThanOrEqual(8); expect(w).toBeLessThanOrEqual(WIDTH_MAX); });
    const notes = ws.getColumn(Object.keys(rows[0]).indexOf('Notes') + 1);
    expect(notes.width).toBe(WIDTH_MAX);
    expect(ws.getRow(2).getCell(Object.keys(rows[0]).indexOf('Notes') + 1).alignment.wrapText).toBe(true);
    expect(ws.getRow(2).getCell(Object.keys(rows[0]).indexOf('Items') + 1).value).toBe('A × 1\nB × 2\nC × 3');
    expect(ws.getRow(2).height).toBeGreaterThanOrEqual(45);
    expect(ws.getColumn(Object.keys(rows[0]).indexOf('ID') + 1).width).toBeLessThan(12);
  });
});
