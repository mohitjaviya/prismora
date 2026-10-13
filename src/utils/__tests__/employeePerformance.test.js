import { describe, it, expect } from 'vitest';
import {
  canViewEmployee, viewableEmployees, periodBounds, ownSalesStats, employeePerformance, activityByMonth,
} from '../employeePerformance';

const LEVELS = { Admin: 'admin', Director: 'admin', 'Sales Manager': 'manager', 'Sales Executive': 'sales', Accounts: 'other', Distributor: 'partner' };
const levelOf = r => LEVELS[r];
const admin = { id: 'A', name: 'Admin', role: 'Admin' };
const mgr = { id: 'M', name: 'Manager', role: 'Sales Manager', managedUsers: ['S1'] };
const s1 = { id: 'S1', name: 'Rep One', role: 'Sales Executive' };
const s2 = { id: 'S2', name: 'Rep Two', role: 'Sales Executive' };
const acc = { id: 'AC', name: 'Accounts', role: 'Accounts' };
const partner = { id: 'P', name: 'Dist', role: 'Distributor' };
const users = [admin, mgr, s1, s2, acc, partner];
const can = (v, t) => canViewEmployee(v, levelOf(v.role), t, levelOf(t.role));

describe('canViewEmployee', () => {
  it('admin opens any employee but no partner', () => {
    expect(can(admin, s2)).toBe(true);
    expect(can(admin, acc)).toBe(true);
    expect(can(admin, partner)).toBe(false);
  });
  it('manager opens self and their team only', () => {
    expect(can(mgr, mgr)).toBe(true);
    expect(can(mgr, s1)).toBe(true);
    expect(can(mgr, s2)).toBe(false);
    expect(can(mgr, admin)).toBe(false);
  });
  it('anyone else only themselves; partners nobody', () => {
    expect(can(s1, s1)).toBe(true);
    expect(can(s1, s2)).toBe(false);
    expect(can(acc, acc)).toBe(true);
    expect(can(partner, partner)).toBe(false);
    expect(can(partner, s1)).toBe(false);
  });
  it('lists viewable staff, viewer first', () => {
    expect(viewableEmployees(mgr, 'manager', users, levelOf).map(u => u.id)).toEqual(['M', 'S1']);
    expect(viewableEmployees(admin, 'admin', users, levelOf).map(u => u.id)).toEqual(['A', 'AC', 'M', 'S1', 'S2']);
    expect(viewableEmployees(partner, 'partner', users, levelOf)).toEqual([]);
  });
});

const NOW = new Date(2026, 9, 13);

describe('periods', () => {
  it('month, last month, last 3 months, all', () => {
    expect(periodBounds('month', NOW)).toEqual([new Date(2026, 9, 1), new Date(2026, 10, 1)]);
    expect(periodBounds('lastMonth', NOW)).toEqual([new Date(2026, 8, 1), new Date(2026, 9, 1)]);
    expect(periodBounds('quarter', NOW)).toEqual([new Date(2026, 7, 1), new Date(2026, 10, 1)]);
    expect(periodBounds('all', NOW)).toBeNull();
  });
});

const data = {
  leads: [
    { assignedTo: 'S1', status: 'First Order', createdAt: '2026-10-02' },
    { assignedTo: 'S1', status: 'Meeting', createdAt: '2026-09-02' },
    { assignedTo: 'S2', status: 'Active', createdAt: '2026-10-02' },
  ],
  orders: [
    { assignedTo: 'S1', status: 'Delivered', value: 1000, date: '2026-10-03' },
    { assignedTo: 'S1', status: 'Cancelled', value: 500, date: '2026-10-04' },
    { assignedTo: 'S1', status: 'Pending', value: 200, date: '2026-09-10' },
    { assignedTo: 'S2', status: 'Pending', value: 999, date: '2026-10-03' },
  ],
  invoices: [{ assignedTo: 'S1', status: 'Settled', amount: 100, tax: 18, createdAt: '2026-10-03' }],
  beatPlans: [{ executiveId: 'S1', status: 'Completed', date: '2026-10-05' }, { executiveId: 'S1', status: 'Planned', date: '2026-10-06' }],
  visitReports: [{ executiveId: 'S1', orderPlaced: true, visitDate: '2026-10-05' }],
  attendance: [{ userId: 'S1', date: '2026-10-05' }, { userId: 'S1', date: '2026-10-05' }, { userId: 'S1', date: '2026-10-06' }],
  sfaExpenses: [{ userId: 'S1', amount: 300, status: 'Approved', date: '2026-10-05' }, { userId: 'S1', amount: 50, status: 'Pending', date: '2026-10-06' }],
  complaints: [{ assignedTo: 'S1', status: 'Resolved', createdAt: '2026-10-01' }, { assignedTo: 'S1', status: 'Open', createdAt: '2026-10-01' }],
  distributorPayments: [{ recordedBy: 'AC', amount: 700, date: '2026-10-02' }],
  creditNotes: [{ recordedBy: 'AC', createdAt: '2026-10-02' }],
  grn: [{ receivedBy: 'W', receivedDate: '2026-10-02' }],
  salesReturns: [{ createdBy: 'W', value: 90, createdAt: '2026-10-02' }],
  territories: [{ executiveId: 'S1', name: 'North' }],
};

describe('employeePerformance', () => {
  it('counts only that person, in the period', () => {
    const p = employeePerformance('S1', data, 'month', NOW);
    expect(p.sales).toMatchObject({ leads: 1, converted: 1, conversionRate: 100, orders: 2, orderValue: 1000, delivered: 1, cancelled: 1, hasData: true });
    expect(p.field).toMatchObject({ beats: 2, beatsFinished: 1, beatCompletion: 50, visits: 1, visitOrders: 1, attendanceDays: 2, territories: ['North'] });
    expect(p.expenses).toMatchObject({ claims: 2, claimed: 350, approved: 300, pending: 1 });
    expect(p.complaints).toMatchObject({ total: 2, resolved: 1, open: 1 });
    expect(p.accounts).toMatchObject({ invoices: 1, invoiceValue: 118, invoicesSettled: 1, hasData: true });
    expect(p.stores.hasData).toBe(false);
    expect(employeePerformance('S1', data, 'all', NOW).sales.orders).toBe(3);
  });
  it('accounts and warehouse work', () => {
    expect(employeePerformance('AC', data, 'all', NOW).accounts).toMatchObject({ payments: 1, paymentsAmount: 700, creditNotes: 1 });
    expect(employeePerformance('W', data, 'all', NOW).stores).toMatchObject({ grns: 1, salesReturns: 1, returnValue: 90, hasData: true });
  });
  it('a person with nothing linked has no data', () => {
    const p = employeePerformance('NOBODY', data, 'all', NOW);
    expect(p.hasAny).toBe(false);
  });
});

describe('ownSalesStats', () => {
  it('is the person\'s own rows only, never company totals', () => {
    const s = ownSalesStats('S1', data, NOW);
    expect(s).toMatchObject({ totalLeads: 2, converted: 1, conversionRate: 50, totalOrders: 3, pendingOrders: 1, totalRevenue: 1200, thisMonth: 1000, growthPct: 400, paidInvoices: 1 });
    expect(ownSalesStats('A', data, NOW)).toMatchObject({ totalLeads: 0, totalOrders: 0, totalRevenue: 0 });
  });
});

describe('activityByMonth', () => {
  it('groups by month, oldest first', () => {
    expect(activityByMonth([{ at: '2026-10-02T10:00:00Z' }, { at: '2026-09-02T10:00:00Z' }, { at: '2026-10-05T10:00:00Z' }, { at: null }]))
      .toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }]);
  });
});
