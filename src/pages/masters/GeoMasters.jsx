import { useMemo, useState } from 'react';
import { MapPinned, Plus, Pencil, Trash2, Check, X, Power } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, useToast } from '../../context/DialogContext';
import { Button, PageHeader } from '../../components/ui';
import { canManageGeo, geoKey, nameProblem, cleanCityName, tidyName } from '../../utils/geo';

/**
 * States and Cities masters (migration 100).
 *
 * Admin / Super Admin: add, rename, switch off or on, delete while unused.
 * Renaming rewrites the name stored on leads, orders, partners and in the
 * territories' district lists in the same transaction, so routing keeps working.
 * Everything here is refused by the database for anyone else.
 */
export default function GeoMasters() {
  const { geoRows, geoMastersSupported, addGeoState, addCity, renameGeo, setGeoActive, deleteGeo } = useData();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const manage = canManageGeo(user?.role);

  const [tab, setTab] = useState('states');
  const [stateId, setStateId] = useState('');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const states = useMemo(() => [...geoRows.states].sort((a, b) => a.name.localeCompare(b.name)), [geoRows.states]);
  const cityCount = useMemo(() => {
    const m = new Map();
    for (const c of geoRows.cities) m.set(c.stateId, (m.get(c.stateId) || 0) + 1);
    return m;
  }, [geoRows.cities]);
  const activeStateId = stateId || states[0]?.id || '';
  const activeState = states.find(s => s.id === activeStateId);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tab === 'states' ? states : geoRows.cities.filter(c => c.stateId === activeStateId).sort((a, b) => a.name.localeCompare(b.name));
    return q ? base.filter(r => r.name.toLowerCase().includes(q)) : base;
  }, [tab, states, geoRows.cities, activeStateId, search]);

  if (!geoMastersSupported) {
    return (
      <div className="space-y-6">
        <PageHeader icon={MapPinned} title="States & Cities" subtitle="The lists behind every State and City dropdown." />
        <div className="glass-card p-6 text-sm text-slate-300">
          The State and City lists are not switched on in the database yet (migration 100). Every dropdown uses the built-in lists until then.
        </div>
      </div>
    );
  }

  const kind = tab === 'states' ? 'state' : 'city';
  const say = (res, ok) => toast(res?.ok ? ok : (res?.error || 'Not saved.'), res?.ok ? 'success' : 'error');

  const add = async () => {
    const name = kind === 'city' ? cleanCityName(newName) : tidyName(newName);
    const bad = nameProblem(name, kind);
    if (bad) { setProblem(bad); return; }
    setBusy(true);
    const res = kind === 'state' ? await addGeoState(name) : await addCity(activeState?.name, name);
    setBusy(false);
    if (res?.ok && res.existing) { setProblem(`${name} is already in ${activeState?.name}.`); return; }
    if (!res?.ok) { setProblem(res?.error || 'Not saved.'); return; }
    setNewName(''); setProblem('');
    toast(`${name} added.`, 'success');
  };

  const saveRename = async (row) => {
    const name = kind === 'city' ? cleanCityName(editName) : tidyName(editName);
    const bad = nameProblem(name, kind);
    if (bad) { toast(bad, 'error'); return; }
    if (name === row.name) { setEditingId(null); return; }
    const dup = (kind === 'state' ? states : geoRows.cities.filter(c => c.stateId === row.stateId))
      .find(r => r.id !== row.id && geoKey(r.name) === geoKey(name));
    if (dup) { toast(`"${dup.name}" already exists.`, 'error'); return; }
    const ok = await confirm({
      title: `Rename ${kind}?`,
      body: `"${row.name}" becomes "${name}". Every lead, order, partner and territory that uses it is changed too, so reports and routing keep matching.`,
      confirmLabel: 'Rename',
    });
    if (!ok) return;
    setBusy(true);
    const res = await renameGeo(kind, row.id, name);
    setBusy(false);
    say(res, `Renamed to ${name}.`);
    if (res?.ok) setEditingId(null);
  };

  const toggle = async (row) => {
    setBusy(true);
    const res = await setGeoActive(kind, row.id, !row.active);
    setBusy(false);
    say(res, `${row.name} switched ${row.active ? 'off' : 'on'}.`);
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: `Delete ${row.name}?`,
      body: 'It can only be deleted while nothing uses it. Otherwise switch it off instead.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteGeo(kind, row.id);
    setBusy(false);
    say(res, `${row.name} deleted.`);
  };

  const inputCls = 'glass-input h-10 px-3 text-sm text-white';

  return (
    <div className="space-y-6">
      <PageHeader icon={MapPinned} title="States & Cities"
        subtitle="Every State and City dropdown reads these lists. Switch a name off to stop it being offered; it stays on old records." />

      <div className="flex flex-wrap items-center gap-2">
        {[['states', `States (${states.length})`], ['cities', `Cities (${geoRows.cities.length})`]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setTab(id); setSearch(''); setEditingId(null); setProblem(''); }}
            className={`px-4 h-9 rounded-lg text-sm font-semibold border ${tab === id ? 'bg-brand-accent text-white border-brand-accent' : 'text-slate-300 border-white/10 hover:bg-white/5'}`}>
            {label}
          </button>
        ))}
        {tab === 'cities' && (
          <select aria-label="State" value={activeStateId} onChange={e => { setStateId(e.target.value); setEditingId(null); setProblem(''); }}
            className={`${inputCls} ml-auto min-w-[12rem]`} style={{ colorScheme: 'dark' }}>
            {states.map(s => <option key={s.id} value={s.id} className="bg-brand-primary">{s.name}{s.active ? '' : ' (off)'}</option>)}
          </select>
        )}
        <input type="search" placeholder={`Search ${tab}…`} aria-label={`Search ${tab}`} value={search} onChange={e => setSearch(e.target.value)}
          className={`${inputCls} ${tab === 'cities' ? '' : 'ml-auto'} min-w-[12rem]`} />
      </div>

      {manage && (
        <div className="glass-card p-4">
          <div className="flex flex-wrap gap-2">
            <input type="text" aria-label={kind === 'state' ? 'New state' : 'New city'} maxLength={60} value={newName}
              placeholder={kind === 'state' ? 'New state or union territory' : `New city in ${activeState?.name || '…'}`}
              onChange={e => { setNewName(e.target.value); setProblem(''); }}
              onKeyDown={e => { if (e.key === 'Enter') add(); }}
              className={`${inputCls} flex-1 min-w-[12rem]`} />
            <Button onClick={add} disabled={busy || !newName.trim() || (kind === 'city' && !activeState)} icon={Plus}>
              Add {kind}
            </Button>
          </div>
          {problem && <p className="mt-2 text-xs text-rose-400" role="alert">{problem}</p>}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-white/10">
            <tr>
              <th className="px-4 py-3">{tab === 'states' ? 'State / union territory' : `City in ${activeState?.name || ''}`}</th>
              {tab === 'states' && <th className="px-4 py-3 w-28">Cities</th>}
              <th className="px-4 py-3 w-28">Status</th>
              {manage && <th className="px-4 py-3 w-44 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2.5 text-white">
                  {editingId === r.id ? (
                    <div className="flex gap-2">
                      <input autoFocus aria-label={`Rename ${r.name}`} value={editName} maxLength={60} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(r); if (e.key === 'Escape') setEditingId(null); }}
                        className={`${inputCls} flex-1 min-w-0`} />
                      <button type="button" onClick={() => saveRename(r)} disabled={busy} aria-label="Save name" className="text-emerald-400 p-2"><Check size={16} /></button>
                      <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className="text-slate-400 p-2"><X size={16} /></button>
                    </div>
                  ) : r.name}
                </td>
                {tab === 'states' && <td className="px-4 py-2.5 text-slate-300">{cityCount.get(r.id) || 0}</td>}
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold ${r.active ? 'text-emerald-400' : 'text-slate-500'}`}>{r.active ? 'On' : 'Off'}</span>
                </td>
                {manage && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => { setEditingId(r.id); setEditName(r.name); }} disabled={busy} title="Rename" aria-label={`Rename ${r.name}`} className="p-2 text-slate-300 hover:text-white"><Pencil size={15} /></button>
                    <button type="button" onClick={() => toggle(r)} disabled={busy} title={r.active ? 'Switch off' : 'Switch on'} aria-label={`${r.active ? 'Switch off' : 'Switch on'} ${r.name}`} className="p-2 text-slate-300 hover:text-white"><Power size={15} /></button>
                    <button type="button" onClick={() => remove(r)} disabled={busy} title="Delete (only if unused)" aria-label={`Delete ${r.name}`} className="p-2 text-rose-400 hover:text-rose-300"><Trash2 size={15} /></button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{search ? 'Nothing matches that search.' : 'Nothing here yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
