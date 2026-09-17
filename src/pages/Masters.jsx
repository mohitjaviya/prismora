import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Layers, Plus, Trash2, Lock, Check, X, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { MASTER_LISTS, optionsFor } from '../utils/masterLists';

/**
 * The dropdown lists, in one place, editable without a deployment.
 *
 * Two kinds of list sit here and the screen keeps them visibly apart. A free
 * list is just words on a form. A workflow list is read by the code — the text
 * 'Delivered' is what deducts stock and raises an invoice — so its options show
 * a padlock: the label can be changed, the underlying value cannot, and they
 * cannot be deleted. Switching one off is how you retire it.
 */
export default function Masters() {
  const { masters, addMasterOption, updateMasterOption, deleteMasterOption } = useData();
  const { canAccess } = useAuth();

  const [activeList, setActiveList] = useState(MASTER_LISTS[0].id);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [error, setError] = useState('');

  const list = MASTER_LISTS.find(l => l.id === activeList);
  const rows = useMemo(
    () => optionsFor(masters, activeList, { includeInactive: true }),
    [masters, activeList]
  );

  // Master data decides how every other screen behaves, so it sits behind the
  // same permission as the rest of Settings rather than being merely hidden.
  //
  // Below the hooks, not above them: React needs the same hooks in the same
  // order on every render, and returning before useMemo would change the count
  // the moment permission changed.
  if (!canAccess('settings', 'full')) return <Navigate to="/?denied=1" replace />;
  // Nothing saved for this list yet, so what is on screen is the built-in
  // fallback rather than anything an administrator has chosen.
  const usingDefaults = !(masters || []).some(m => m.list === activeList);

  const say = async (result) => {
    setError(result?.ok === false ? result.error : '');
    return result;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const r = await say(await addMasterOption(activeList, newLabel));
    if (r.ok) setNewLabel('');
  };

  const startEdit = (row) => { setEditingId(row.id); setEditLabel(row.label); setError(''); };

  const saveEdit = async (row) => {
    const r = await say(await updateMasterOption(row.id, { label: editLabel.trim() }));
    if (r.ok) setEditingId(null);
  };

  const move = async (row, direction) => {
    const ordered = [...rows];
    const i = ordered.findIndex(r => r.id === row.id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    await updateMasterOption(ordered[i].id, { sort: j });
    await updateMasterOption(ordered[j].id, { sort: i });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layers size={24} className="text-brand-accent" /> Master Lists
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          The options that appear in dropdowns across the app. Change them here instead of asking for a code change.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Which list */}
        <div className="glass-panel rounded-2xl border border-white/5 p-2 h-fit">
          {MASTER_LISTS.map(l => (
            <button
              key={l.id}
              onClick={() => { setActiveList(l.id); setEditingId(null); setError(''); setNewLabel(''); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors mb-0.5 ${
                activeList === l.id
                  ? 'bg-brand-accent/15 text-brand-accent font-semibold'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {l.locked && <Lock size={11} className="opacity-60 flex-shrink-0" />}
                {l.name}
              </span>
            </button>
          ))}
        </div>

        {/* The options in it */}
        <div className="glass-panel rounded-2xl border border-white/5 p-5">
          <h2 className="text-base font-bold text-white">{list.name}</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{list.description}</p>

          {list.locked && (
            <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-[11px] text-amber-300 leading-relaxed flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
                <span>
                  The app reads these values to decide what to do. You can rename one — what staff see — and
                  reorder or switch options off, but the value behind a <Lock size={10} className="inline" /> cannot
                  change and it cannot be deleted. Renaming is safe; removing would stop the workflow.
                </span>
              </p>
            </div>
          )}

          {usingDefaults && (
            <p className="mt-3 text-[11px] text-slate-500">
              Showing the built-in defaults — nothing has been saved for this list yet. Adding or editing an
              option starts from these.
            </p>
          )}

          {error && (
            <p className="mt-3 text-xs text-rose-400 font-medium">{error}</p>
          )}

          <div className="mt-4 space-y-1.5">
            {rows.map((row, idx) => (
              <div
                key={row.id || row.key}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  row.active === false
                    ? 'border-white/5 bg-white/[0.02] opacity-50'
                    : 'border-white/5 bg-brand-primary-lighter/20'
                }`}
              >
                <div className="flex flex-col">
                  <button onClick={() => move(row, -1)} disabled={idx === 0}
                    className="text-slate-500 hover:text-white disabled:opacity-20 leading-none" title="Move up">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => move(row, 1)} disabled={idx === rows.length - 1}
                    className="text-slate-500 hover:text-white disabled:opacity-20 leading-none" title="Move down">
                    <ChevronDown size={13} />
                  </button>
                </div>

                {editingId === row.id ? (
                  <>
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(row); if (e.key === 'Escape') setEditingId(null); }}
                      className="flex-1 glass-input rounded-lg px-2.5 py-1.5 text-sm text-white"
                    />
                    <button onClick={() => saveEdit(row)} className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded-lg"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-white/5 rounded-lg"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(row)} className="flex-1 text-left min-w-0">
                      <span className="text-sm text-white">{row.label}</span>
                      {/* Shown only once they differ, so it explains itself the
                          moment someone renames something. */}
                      {row.label !== row.key && (
                        <span className="text-[10px] text-slate-500 ml-2 font-mono">stored as {row.key}</span>
                      )}
                    </button>

                    {row.locked && <Lock size={12} className="text-amber-400/70 flex-shrink-0" title="The app reads this value" />}

                    <button
                      onClick={() => updateMasterOption(row.id, { active: row.active === false })}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ${
                        row.active === false
                          ? 'border-white/10 text-slate-400 hover:text-white'
                          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      }`}
                      title={row.active === false ? 'Not offered in dropdowns' : 'Offered in dropdowns'}
                    >
                      {row.active === false ? 'Off' : 'On'}
                    </button>

                    {!row.locked && (
                      <button
                        onClick={async () => {
                          if (confirm(`Remove "${row.label}"? Records already using it will still show it.`)) {
                            say(await deleteMasterOption(row.id));
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg flex-shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleAdd} className="mt-4 flex gap-2">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder={`Add to ${list.name.toLowerCase()}…`}
              className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
            />
            <button type="submit" disabled={!newLabel.trim()}
              className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-1.5 text-sm font-bold disabled:opacity-40">
              <Plus size={15} /> Add
            </button>
          </form>

          <p className="mt-3 text-[11px] text-slate-600 leading-relaxed">
            Switching an option off hides it from new records without touching the ones that already use it —
            which is nearly always what you want instead of deleting.
          </p>
        </div>
      </div>
    </div>
  );
}
