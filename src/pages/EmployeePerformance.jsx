import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Activity, TrendingUp, MapPin, Wallet, MessageSquareWarning, Receipt, Warehouse, History, UserX, Users,
} from 'lucide-react';
import { useAuth, roleLevel } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { supabase } from '../supabaseClient';
import { Badge, EmptyState, PageHeader, SectionCard, Select, StatCard } from '../components/ui';
import { canViewAuditLog, summarise, tableLabel } from '../utils/audit';
import { canViewEmployee, viewableEmployees, employeePerformance, activityByMonth, periodBounds, PERIODS } from '../utils/employeePerformance';

/**
 * One employee's performance (Gap 4). Admin level opens anyone, a manager
 * themselves and their team, everyone else themselves; partners never. The
 * database limits the per-person tables the same way, so a manager's browser
 * holds no other team's rows to show even if this check were bypassed.
 */

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const MONTH = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

function Stats({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(s => <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} icon={s.icon} tone={s.tone} />)}
    </div>
  );
}

function ActivityCard({ userId, periodKey }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let live = true;
    (async () => {
      setState('loading');
      let q = supabase.from('audit_log').select('id, at, action, table_name, row_id, changes')
        .eq('actor_id', userId).order('at', { ascending: false }).limit(1000);
      const b = periodBounds(periodKey);
      if (b) q = q.gte('at', b[0].toISOString()).lt('at', b[1].toISOString());
      const { data, error } = await q;
      if (!live) return;
      if (error) { setState('error'); return; }
      setRows(data || []);
      setState('ready');
    })();
    return () => { live = false; };
  }, [userId, periodKey]);

  const months = activityByMonth(rows);
  return (
    <SectionCard icon={History} title="Activity" subtitle="Every save this person made, from the audit log (latest 1,000 in the period).">
      {state === 'loading' && <p className="text-sm text-slate-500">Loading…</p>}
      {state === 'error' && <p className="text-sm text-rose-400">The audit log could not be read.</p>}
      {state === 'ready' && rows.length === 0 && <p className="text-sm text-slate-500">No saves recorded in this period.</p>}
      {state === 'ready' && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">{rows.length.toLocaleString('en-IN')} saves</Badge>
            {months.map(m => <Badge key={m.month} tone="neutral">{MONTH(m.month)}: {m.count}</Badge>)}
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            {rows.slice(0, 20).map(e => (
              <li key={e.id} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-slate-500 text-xs w-36 shrink-0">{new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="text-slate-400 text-xs w-32 shrink-0">{tableLabel(e.table_name)}</span>
                <span className="text-slate-300 min-w-0 flex-1 break-words">{summarise(e)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export default function EmployeePerformance() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, users } = useAuth();
  const data = useData();
  const [periodKey, setPeriodKey] = useState('all');

  const viewerLevel = roleLevel(user?.role);
  const targetId = id || user?.id;
  const target = (users || []).find(u => u.id === targetId) || (targetId === user?.id ? user : null);
  const allowed = canViewEmployee(user, viewerLevel, target, roleLevel(target?.role));
  const choices = useMemo(() => viewableEmployees(user, viewerLevel, users, roleLevel), [user, viewerLevel, users]);

  const perf = useMemo(
    () => (allowed ? employeePerformance(targetId, data, periodKey) : null),
    [allowed, targetId, data, periodKey],
  );

  if (!allowed) {
    return (
      <EmptyState icon={UserX} title="You can't open this employee's performance"
        hint={viewerLevel === 'partner'
          ? 'Employee performance is for staff only.'
          : 'You can open your own page, and a manager can open the people they manage.'}
        action={viewerLevel !== 'partner' && <Link to="/team/performance" className="text-brand-accent text-sm font-semibold hover:underline">Open my performance</Link>} />
    );
  }

  const { sales, field, expenses, complaints, accounts, stores } = perf;
  const period = PERIODS.find(p => p.key === periodKey)?.label || '';
  const manages = (target.managedUsers || []).map(mid => (users || []).find(u => u.id === mid)?.name).filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader icon={Activity} title={target.id === user.id ? 'My performance' : `${target.name} — performance`}
        subtitle="Work linked to this person in the chosen period. Targets are not set per employee yet."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {choices.length > 1 && (
              <Select aria-label="Employee" value={target.id} onChange={e => navigate(`/team/${e.target.value}/performance`)}>
                {choices.map(u => <option key={u.id} value={u.id}>{u.id === user.id ? `${u.name} (me)` : `${u.name} — ${u.role}`}</option>)}
              </Select>
            )}
            <Select aria-label="Period" value={periodKey} onChange={e => setPeriodKey(e.target.value)}>
              {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </div>
        )} />

      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-bold">
          {String(target.name || '?').substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold">{target.name}</p>
          <p className="text-xs text-slate-500 break-all">{target.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{target.role}</Badge>
          {target.status && <Badge tone={target.status === 'Inactive' ? 'danger' : 'neutral'}>{target.status}</Badge>}
          {field.territories.map(t => <Badge key={t} tone="info">{t}</Badge>)}
        </div>
        {manages.length > 0 && (
          <p className="w-full text-xs text-slate-400 flex items-center gap-1.5"><Users size={12} /> Manages: {manages.join(', ')}</p>
        )}
      </div>

      {!perf.hasAny && (
        <EmptyState icon={Activity} title={`No work is linked to ${target.name} in ${period.toLowerCase()}`}
          hint={`Leads, orders, field visits, attendance, expenses, complaints, invoices, payments, purchase orders, goods receipts and returns are counted per person. ${target.role} work that is none of these isn't tracked per person yet${canViewAuditLog(user.role) ? '; the activity log below shows every save they made' : ''}.`} />
      )}

      {sales.hasData && (
        <SectionCard icon={TrendingUp} title="Sales" subtitle="Leads and orders assigned to this person.">
          <Stats items={[
            { label: 'Leads', value: sales.leads, hint: `${sales.converted} converted` },
            { label: 'Conversion', value: `${sales.conversionRate}%`, tone: 'info' },
            { label: 'Orders', value: sales.orders, hint: `${sales.delivered} delivered · ${sales.open} open · ${sales.cancelled} cancelled` },
            { label: 'Order value booked', value: rupees(sales.orderValue), hint: 'Cancelled orders left out', tone: 'success' },
          ]} />
        </SectionCard>
      )}

      {field.hasData && (
        <SectionCard icon={MapPin} title="Field work" subtitle="Beats, visits and attendance.">
          <Stats items={[
            { label: 'Beats', value: field.beats, hint: `${field.beatsFinished} finished (${field.beatCompletion}%)` },
            { label: 'Visits', value: field.visits, hint: `${field.visitOrders} with an order`, tone: 'info' },
            { label: 'Days present', value: field.attendanceDays, tone: 'success' },
            { label: 'Early check-in requests', value: field.checkinRequests },
          ]} />
        </SectionCard>
      )}

      {expenses.hasData && (
        <SectionCard icon={Wallet} title="Expenses" subtitle="Field expense claims and expenses booked to this person.">
          <Stats items={[
            { label: 'Field claims', value: expenses.claims, hint: `${expenses.pending} pending` },
            { label: 'Claimed', value: rupees(expenses.claimed) },
            { label: 'Approved', value: rupees(expenses.approved), tone: 'success' },
            { label: 'Booked expenses', value: expenses.booksExpenses, hint: rupees(expenses.booksAmount) },
          ]} />
        </SectionCard>
      )}

      {complaints.hasData && (
        <SectionCard icon={MessageSquareWarning} title="Complaints handled" subtitle="Complaints assigned to this person.">
          <Stats items={[
            { label: 'Assigned', value: complaints.total },
            { label: 'Resolved', value: complaints.resolved, tone: 'success' },
            { label: 'Still open', value: complaints.open, tone: 'warning' },
          ]} />
        </SectionCard>
      )}

      {accounts.hasData && (
        <SectionCard icon={Receipt} title="Accounts work" subtitle="Invoices assigned, partner payments and credit notes recorded.">
          <Stats items={[
            { label: 'Invoices', value: accounts.invoices, hint: `${accounts.invoicesSettled} settled` },
            { label: 'Invoice value', value: rupees(accounts.invoiceValue) },
            { label: 'Payments recorded', value: accounts.payments, hint: rupees(accounts.paymentsAmount), tone: 'success' },
            { label: 'Credit notes', value: accounts.creditNotes },
          ]} />
        </SectionCard>
      )}

      {stores.hasData && (
        <SectionCard icon={Warehouse} title="Purchase and warehouse" subtitle="Purchase orders, goods receipts and sales returns.">
          <Stats items={[
            { label: 'Purchase orders', value: stores.purchaseOrders, hint: rupees(stores.purchaseValue) },
            { label: 'Goods receipts', value: stores.grns, tone: 'info' },
            { label: 'Sales returns', value: stores.salesReturns, hint: rupees(stores.returnValue) },
          ]} />
        </SectionCard>
      )}

      {/* The database lets only these roles read the audit log (040). */}
      {canViewAuditLog(user.role) && <ActivityCard userId={target.id} periodKey={periodKey} />}
    </div>
  );
}
