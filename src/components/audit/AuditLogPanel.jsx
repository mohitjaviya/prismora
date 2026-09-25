import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { DataTable, Badge } from '../ui';
import { actorLabel, changedFields, summarise, tableLabel, TABLE_LABELS } from '../../utils/audit';

/**
 * The Audit Log: every change the database recorded, with the person who made
 * it (040). Filters run in the database, so "everything Ravi did this week" is
 * one query however long the log grows.
 */

const LIMIT = 1000;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ACTION_TONE = { created: 'success', changed: 'info', deleted: 'danger' };
const SYSTEM = '__system__';

function ChangesCell({ entry }) {
  const [open, setOpen] = useState(false);
  const fields = changedFields(entry);
  if (entry.action !== 'changed' || fields.length <= 2) {
    return <span className="text-slate-300 whitespace-normal break-words">{summarise(entry)}</span>;
  }
  const shown = open ? fields : fields.slice(0, 2);
  return (
    <div className="whitespace-normal break-words">
      {shown.map(f => (
        <div key={f.field} className="text-slate-300">
          <span className="text-slate-500">{f.field}:</span> {f.from} → {f.to}
        </div>
      ))}
      <button type="button" onClick={() => setOpen(o => !o)} className="text-[10px] font-semibold text-brand-accent hover:underline">
        {open ? 'Show less' : `+${fields.length - 2} more fields`}
      </button>
    </div>
  );
}

export default function AuditLogPanel({ users }) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const [person, setPerson] = useState('');
  const [table, setTable] = useState('');
  const [from, setFrom] = useState(isoDay(weekAgo));
  const [to, setTo] = useState(isoDay(today));
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | missing | error
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(LIMIT);
    if (from) q = q.gte('at', new Date(`${from}T00:00:00`).toISOString());
    if (to) q = q.lt('at', new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString());
    if (person === SYSTEM) q = q.is('actor_id', null);
    else if (person) q = q.eq('actor_id', person);
    if (table) q = q.eq('table_name', table);
    const { data, error } = await q;
    if (error) {
      const missing = /audit_log/.test(error.message || '') && /(does not exist|schema cache|Could not find)/i.test(error.message || '');
      setState(missing ? 'missing' : 'error');
      setMessage(error.message || '');
      setRows([]);
      return;
    }
    setRows(data || []);
    setState('ready');
  }, [person, table, from, to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the database is what this effect is for
  useEffect(() => { load(); }, [load]);

  const people = [...(users || [])]
    .filter(u => u?.id && u?.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const columns = [
    {
      key: 'at', header: 'When', sort: e => e.at,
      render: e => (
        <span className="font-mono text-slate-400 whitespace-nowrap">
          {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'person', header: 'Person', sort: e => actorLabel(e).name,
      render: e => {
        const who = actorLabel(e);
        return who.system
          ? <span className="text-slate-500 italic whitespace-nowrap">System</span>
          : (
            <div className="whitespace-nowrap">
              <div className="font-semibold text-white">{who.name}</div>
              {who.role && <div className="text-[10px] text-slate-500">{who.role}</div>}
            </div>
          );
      },
    },
    {
      key: 'action', header: 'Action', sort: e => `${e.table_name} ${e.action}`,
      render: e => (
        <div className="whitespace-nowrap">
          <Badge tone={ACTION_TONE[e.action] || 'neutral'}>{e.action}</Badge>
          <div className="text-[10px] text-slate-500 mt-1">{tableLabel(e.table_name)}</div>
        </div>
      ),
    },
    {
      key: 'record', header: 'Record', sort: e => e.row_id,
      render: e => <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">{e.row_id || '—'}</span>,
    },
    {
      key: 'what', header: 'What changed',
      render: e => (
        <div className="max-w-[26rem]">
          <ChangesCell entry={e} />
          {e.via && <div className="text-[10px] text-slate-500 italic mt-0.5">via {e.via}</div>}
        </div>
      ),
    },
  ];

  const selectCls = 'glass-input rounded-lg px-2.5 py-1.5 text-xs text-white';

  const toolbar = (
    <>
      <select aria-label="Person" value={person} onChange={e => setPerson(e.target.value)} className={selectCls}>
        <option value="">Everyone</option>
        {people.map(u => <option key={u.id} value={u.id}>{u.name}{u.role ? ` — ${u.role}` : ''}</option>)}
        <option value={SYSTEM}>System (no person)</option>
      </select>
      <select aria-label="Record type" value={table} onChange={e => setTable(e.target.value)} className={selectCls}>
        <option value="">All records</option>
        {Object.entries(TABLE_LABELS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input type="date" aria-label="From" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className={selectCls} />
      <span className="text-[11px] text-slate-500">to</span>
      <input type="date" aria-label="To" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className={selectCls} />
      <button type="button" onClick={load} title="Reload" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
        <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
      </button>
    </>
  );

  if (state === 'missing') {
    return (
      <div className="glass-panel rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-sm text-amber-300">
        The audit trail is not set up on this database yet. It starts recording once migration
        040_audit_log_and_last_modified.sql has been run. The Activity feed still shows what it always did.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <DataTable
        title="Audit trail"
        columns={columns}
        rows={rows}
        rowKey={e => e.id}
        pageSize={50}
        dense
        toolbar={toolbar}
        search={e => `${actorLabel(e).name} ${e.actor_role || ''} ${tableLabel(e.table_name)} ${e.row_id || ''} ${summarise(e)} ${e.via || ''}`}
        searchPlaceholder="Search within these results"
        empty={{
          icon: History,
          title: state === 'loading' ? 'Loading…' : state === 'error' ? 'Could not load the audit trail' : 'Nothing recorded for these filters',
          hint: state === 'error' ? message : 'Widen the dates, or choose Everyone.',
        }}
      />
      {rows.length >= LIMIT && (
        <p className="text-[11px] text-amber-400">
          Showing the newest {LIMIT} entries. Narrow the dates or choose a person to see the rest.
        </p>
      )}
    </div>
  );
}
