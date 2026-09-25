import { describe, it, expect } from 'vitest';
import { beatStatusFor, submitOutletVisit } from '../beatVisits';
import { territoryDependants } from '../territory';

// Stand-ins for DataContext's two writes. `reports` and `beat` are what the
// database would hold afterwards.
const fakeDb = ({ orderSaves = true, reportSaves = true, beatSaves = true } = {}) => {
  const db = { orders: [], reports: [], beat: { outlets: ['Shiv medicals'], outletVisits: {} }, reportCalls: 0, orderCalls: 0 };
  db.addOrder = async (order) => {
    db.orderCalls += 1;
    if (!orderSaves) return null;
    const id = `O${db.orders.length + 1}`;
    db.orders.push({ ...order, id });
    return id;
  };
  db.addVisitReport = async (report) => {
    db.reportCalls += 1;
    if (!reportSaves) return null;
    const id = `VR-${db.reports.length + 1}`;
    db.reports.push({ ...report, id });
    return id;
  };
  db.recordOutletOutcome = async (beatId, outlet, outcome, extra) => {
    if (!beatSaves) return false;
    db.beat.outletVisits = { ...db.beat.outletVisits, [outlet]: { outcome, ...extra } };
    return true;
  };
  return db;
};

const REPORT = { executiveId: 'U-abhi', beatId: 'B-1', outletName: 'Shiv medicals', outcome: 'Visited' };
const VISIT = { report: REPORT, beatId: 'B-1', outlet: 'Shiv medicals' };

describe('submitOutletVisit - a completed beat always has its visit report', () => {
  it('saves the report and marks the outlet against its id', async () => {
    const db = fakeDb();
    const result = await submitOutletVisit(db, VISIT);

    expect(result).toEqual({ ok: true, orderId: null, visitId: 'VR-1', error: null });
    expect(db.reports).toHaveLength(1);
    expect(db.beat.outletVisits['Shiv medicals'].visitId).toBe('VR-1');
    expect(beatStatusFor(db.beat.outlets, db.beat.outletVisits)).toBe('Completed');
  });

  // The bug: the report insert was refused, nothing checked, and the outlet
  // was marked done anyway — "Completed, 1/1 done" with 0 reports.
  it('leaves the outlet open when the report is refused', async () => {
    const db = fakeDb({ reportSaves: false });
    const result = await submitOutletVisit(db, VISIT);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not marked done/);
    expect(db.reports).toHaveLength(0);
    expect(db.beat.outletVisits).toEqual({});
    expect(beatStatusFor(db.beat.outlets, db.beat.outletVisits)).toBe('Planned');
  });

  it('never has a finished beat without a report for every outlet marked', async () => {
    for (const reportSaves of [true, false]) {
      const db = fakeDb({ reportSaves });
      await submitOutletVisit(db, VISIT);
      const marked = Object.values(db.beat.outletVisits);
      for (const m of marked) expect(db.reports.map(r => r.id)).toContain(m.visitId);
    }
  });

  it('says so when the report saved but the beat did not', async () => {
    const db = fakeDb({ beatSaves: false });
    const result = await submitOutletVisit(db, VISIT);
    expect(result).toMatchObject({ ok: false, visitId: 'VR-1' });
    expect(result.error).toMatch(/beat could not be updated/);
  });

  it('retries the beat without filing the report a second time', async () => {
    const db = fakeDb();
    const result = await submitOutletVisit(db, { ...VISIT, savedVisitId: 'VR-9' });
    expect(result).toMatchObject({ ok: true, visitId: 'VR-9' });
    expect(db.reportCalls).toBe(0);
    expect(db.beat.outletVisits['Shiv medicals'].visitId).toBe('VR-9');
  });

  it('links the report to the order taken on the visit', async () => {
    const db = fakeDb();
    const result = await submitOutletVisit(db, { ...VISIT, order: { customerName: 'Shiv medicals' } });
    expect(result).toMatchObject({ ok: true, orderId: 'O1', visitId: 'VR-1' });
    expect(db.reports[0].orderId).toBe('O1');
  });

  // The second bug: a Sales Executive's order was refused (orders is view-only
  // for that role), addOrder still returned "O7", and the report naming O7 was
  // then refused by the foreign key.
  it('files nothing and marks nothing when the order is refused', async () => {
    const db = fakeDb({ orderSaves: false });
    const result = await submitOutletVisit(db, { ...VISIT, order: { customerName: 'Shiv medicals' } });
    expect(result).toMatchObject({ ok: false, orderId: null, visitId: null });
    expect(result.error).toMatch(/order could not be saved/);
    expect(db.reportCalls).toBe(0);
    expect(db.beat.outletVisits).toEqual({});
  });

  it('never files a report naming an order that was not saved', async () => {
    for (const orderSaves of [true, false]) {
      const db = fakeDb({ orderSaves });
      await submitOutletVisit(db, { ...VISIT, order: { customerName: 'Shiv medicals' } });
      for (const r of db.reports) {
        if (r.orderId) expect(db.orders.map(o => o.id)).toContain(r.orderId);
      }
    }
  });

  it('does not raise the order again on a retry after the report failed', async () => {
    const db = fakeDb();
    const result = await submitOutletVisit(db, { ...VISIT, order: { customerName: 'Shiv medicals' }, savedOrderId: 'O1' });
    expect(db.orderCalls).toBe(0);
    expect(result.orderId).toBe('O1');
    expect(db.reports[0].orderId).toBe('O1');
  });

  it('files a report with no beat for a visit made off-route', async () => {
    const db = fakeDb();
    const result = await submitOutletVisit(db, { report: REPORT });
    expect(result.ok).toBe(true);
    expect(db.reports).toHaveLength(1);
    expect(db.beat.outletVisits).toEqual({});
  });
});

describe('beatStatusFor', () => {
  const outlets = ['A', 'B'];

  it('is Planned until something is recorded', () => {
    expect(beatStatusFor(outlets, {})).toBe('Planned');
    expect(beatStatusFor(outlets, undefined)).toBe('Planned');
  });

  it('is In Progress while outlets remain', () => {
    expect(beatStatusFor(outlets, { A: { outcome: 'Visited' } })).toBe('In Progress');
  });

  it('is Completed once every outlet has an outcome and one was visited', () => {
    expect(beatStatusFor(outlets, { A: { outcome: 'Visited' }, B: { outcome: 'Not Visited' } })).toBe('Completed');
  });

  it('is Not Visited when every outlet was missed', () => {
    expect(beatStatusFor(outlets, { A: { outcome: 'Not Visited' }, B: { outcome: 'Not Visited' } })).toBe('Not Visited');
  });
});

describe('territoryDependants - what a territory delete would leave showing "—"', () => {
  const records = {
    beatPlans: [{ territoryId: 'T-1' }, { territoryId: 'T-2' }],
    orders: [{ territoryId: 'T-1' }, { territoryId: 'T-1' }],
    retailers: [{ territoryId: 'T-1' }],
  };

  it('counts every kind of record that points at it', () => {
    expect(territoryDependants('T-1', records)).toBe('1 beat plan, 2 orders, 1 retailer');
  });

  it('is empty when nothing refers to it', () => {
    expect(territoryDependants('T-3', records)).toBe('');
    expect(territoryDependants('', records)).toBe('');
  });
});
