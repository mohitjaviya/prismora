/**
 * One employee's performance (Gap 4).
 *
 * Who may open whose page is the field-records rule (sfaVisibility):
 * admin level sees everyone, a manager themselves and the people they manage,
 * everyone else only themselves. Partners never: not as the viewer, not as
 * the person viewed. The database applies the same rule to the per-person
 * tables (can_see_rep / sees_account_row), so a manager's browser never holds
 * another team's leads, orders, attendance, beats, visits or field expenses.
 *
 * Everything here is counted from rows the app has already loaded, so the
 * numbers match the list screens they come from.
 */
import { canSeeOwner } from './sfaVisibility';
import { isConvertedLead } from './leadStatus';
import { isSettled, invoiceTotal } from './invoiceStatus';

export const canViewEmployee = (viewer, viewerLevel, target, targetLevel) => {
  if (!viewer || !target?.id) return false;
  if (!viewerLevel || viewerLevel === 'partner') return false;
  if (!targetLevel || targetLevel === 'partner') return false;
  return canSeeOwner(viewer, viewerLevel, target.id);
};

/** The staff a viewer may open, themselves first. */
export const viewableEmployees = (viewer, viewerLevel, users, levelOf) => {
  const list = (users || []).filter(u => canViewEmployee(viewer, viewerLevel, u, levelOf(u?.role)));
  return list.sort((a, b) => (a.id === viewer?.id ? -1 : b.id === viewer?.id ? 1 : String(a.name).localeCompare(String(b.name))));
};

export const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'all', label: 'All time' },
];

/** [from, to) for a period, or null for all time. */
export const periodBounds = (key, now = new Date()) => {
  const y = now.getFullYear(); const m = now.getMonth();
  if (key === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 1)];
  if (key === 'lastMonth') return [new Date(y, m - 1, 1), new Date(y, m, 1)];
  if (key === 'quarter') return [new Date(y, m - 2, 1), new Date(y, m + 1, 1)];
  return null;
};

const inPeriod = (value, bounds) => {
  if (!bounds) return true;
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d >= bounds[0] && d < bounds[1];
};

const num = (v) => Number(v) || 0;
const sum = (rows, f) => rows.reduce((s, r) => s + num(f(r)), 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const mine = (rows, key, id) => (rows || []).filter(r => r && r[key] === id);

const BEAT_FINISHED = ['Completed', 'Not Visited', 'Visited'];
const COMPLAINT_DONE = ['Resolved', 'Closed'];

/**
 * The signed-in person's own sales figures (Profile "Your Performance"):
 * their leads, orders and invoices, whatever their role. Company totals live
 * in Reports and the Director dashboard.
 */
export const ownSalesStats = (userId, { leads, orders, invoices }, now = new Date()) => {
  const myLeads = mine(leads, 'assignedTo', userId);
  const myOrders = mine(orders, 'assignedTo', userId);
  const myInvoices = mine(invoices, 'assignedTo', userId);
  // Order value booked, not revenue; cancelled orders left out.
  const booked = myOrders.filter(o => o.status !== 'Cancelled');
  const converted = myLeads.filter(isConvertedLead).length;
  const orderDate = o => o.date || o.createdAt;
  const thisMonth = sum(booked.filter(o => inPeriod(orderDate(o), periodBounds('month', now))), o => o.value);
  const lastMonth = sum(booked.filter(o => inPeriod(orderDate(o), periodBounds('lastMonth', now))), o => o.value);
  const growthPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : (thisMonth > 0 ? 100 : 0);
  return {
    totalLeads: myLeads.length,
    converted,
    conversionRate: pct(converted, myLeads.length),
    totalOrders: myOrders.length,
    pendingOrders: myOrders.filter(o => o.status === 'Pending' || o.status === 'Processing').length,
    totalRevenue: sum(booked, o => o.value),
    thisMonth,
    growthPct,
    paidInvoices: myInvoices.filter(isSettled).length,
  };
};

/**
 * Every section for one person in a period. Each section says whether it has
 * anything (`hasData`), so the page shows only what applies to that person.
 */
export const employeePerformance = (userId, data, periodKey = 'all', now = new Date()) => {
  const b = periodBounds(periodKey, now);
  const d = data || {};
  const take = (rows, key, dateOf) => mine(rows, key, userId).filter(r => inPeriod(dateOf(r), b));

  const leads = take(d.leads, 'assignedTo', r => r.createdAt);
  const orders = take(d.orders, 'assignedTo', r => r.date || r.createdAt);
  const booked = orders.filter(o => o.status !== 'Cancelled');
  const converted = leads.filter(isConvertedLead).length;
  const sales = {
    leads: leads.length,
    converted,
    conversionRate: pct(converted, leads.length),
    orders: orders.length,
    orderValue: sum(booked, o => o.value),
    delivered: orders.filter(o => o.status === 'Delivered').length,
    open: orders.filter(o => !['Delivered', 'Cancelled'].includes(o.status)).length,
    cancelled: orders.length - booked.length,
  };
  sales.hasData = sales.leads + sales.orders > 0;

  const beats = take(d.beatPlans, 'executiveId', r => r.date);
  const visits = take(d.visitReports, 'executiveId', r => r.visitDate || r.createdAt);
  const days = take(d.attendance, 'userId', r => r.date);
  const checkins = take(d.beatCheckinRequests, 'requestedBy', r => r.createdAt);
  const territories = mine(d.territories, 'executiveId', userId);
  const finished = beats.filter(x => BEAT_FINISHED.includes(x.status)).length;
  const field = {
    beats: beats.length,
    beatsFinished: finished,
    beatCompletion: pct(finished, beats.length),
    visits: visits.length,
    visitOrders: visits.filter(v => v.orderPlaced).length,
    attendanceDays: new Set(days.map(a => a.date)).size,
    checkinRequests: checkins.length,
    territories: territories.map(t => t.name).filter(Boolean),
  };
  field.hasData = field.beats + field.visits + field.attendanceDays + field.checkinRequests > 0;

  const claims = take(d.sfaExpenses, 'userId', r => r.date || r.createdAt);
  const booksExpenses = take(d.expenses, 'assignedTo', r => r.date || r.createdAt);
  const expenses = {
    claims: claims.length,
    claimed: sum(claims, r => r.amount),
    approved: sum(claims.filter(r => r.status === 'Approved'), r => r.amount),
    pending: claims.filter(r => r.status === 'Pending').length,
    booksExpenses: booksExpenses.length,
    booksAmount: sum(booksExpenses, r => r.amount),
  };
  expenses.hasData = expenses.claims + expenses.booksExpenses > 0;

  const handled = take(d.complaints, 'assignedTo', r => r.createdAt);
  const resolved = handled.filter(c => COMPLAINT_DONE.includes(c.status)).length;
  const complaints = { total: handled.length, resolved, open: handled.length - resolved };
  complaints.hasData = complaints.total > 0;

  const invoices = take(d.invoices, 'assignedTo', r => r.createdAt);
  const payments = take(d.distributorPayments, 'recordedBy', r => r.date || r.createdAt);
  const creditNotes = take(d.creditNotes, 'recordedBy', r => r.createdAt);
  const accounts = {
    invoices: invoices.length,
    invoiceValue: sum(invoices, invoiceTotal),
    invoicesSettled: invoices.filter(isSettled).length,
    payments: payments.length,
    paymentsAmount: sum(payments, r => r.amount),
    creditNotes: creditNotes.length,
  };
  accounts.hasData = accounts.invoices + accounts.payments + accounts.creditNotes > 0;

  const pos = take(d.purchaseOrders, 'assignedTo', r => r.createdAt);
  const grns = take(d.grn, 'receivedBy', r => r.receivedDate || r.createdAt);
  const returns = take(d.salesReturns, 'createdBy', r => r.createdAt);
  const stores = {
    purchaseOrders: pos.length,
    purchaseValue: sum(pos, r => r.total),
    grns: grns.length,
    salesReturns: returns.length,
    returnValue: sum(returns, r => r.value),
  };
  stores.hasData = stores.purchaseOrders + stores.grns + stores.salesReturns > 0;

  return {
    sales, field, expenses, complaints, accounts, stores,
    hasAny: [sales, field, expenses, complaints, accounts, stores].some(s => s.hasData),
  };
};

/** Audit rows → saves per month, oldest first: [{ month: '2026-10', count }]. */
export const activityByMonth = (entries) => {
  const by = {};
  (entries || []).forEach(e => {
    if (!e?.at) return;
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime())) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    by[k] = (by[k] || 0) + 1;
  });
  return Object.keys(by).sort().map(month => ({ month, count: by[month] }));
};
