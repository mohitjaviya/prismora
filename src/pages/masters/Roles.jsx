import { useState, useMemo } from 'react';
import { useAuth, PERMISSIONS, FALLBACK_LEVELS } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import {
  Shield, ChevronLeft, Lock, AlertTriangle, Check, Users, Copy, RefreshCw,
} from 'lucide-react';
import { PageHeader, Button, StatCard, SearchInput } from '../../components/ui';
import {
  MODULES, MODULE_GROUPS, ROLE_LEVELS, grantedCount, isAdminLevel, rejectPermissionChange,
  fallbackRoles, roleSummary, peopleByRole, holdersOf, orphanedRoles,
} from '../../utils/roleUtils';

/**
 * Who may see what, editable.
 *
 * It was a constant in AuthContext.jsx — fifteen roles against twenty-one
 * modules — so letting Accounts see purchases meant a developer and a
 * deployment.
 *
 * Two things the screen will not let you do, because there is no way back from
 * either inside the app: restrict an administrator role, and take Settings away
 * from your own role. Both are refused in roleUtils as well, so neither depends
 * on the screen being the only way in.
 */

const ACCESS_STYLE = {
  full: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  view: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  none: 'bg-white/5 text-slate-500 border-white/10',
};

const ACCESS_BAR = { full: 'bg-emerald-500/70', view: 'bg-amber-500/70', none: 'bg-white/10' };

const LEVEL_STYLE = {
  admin: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  manager: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  sales: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  staff: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
  partner: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
};

const levelName = (id) => (ROLE_LEVELS.find(l => l.id === id) || {}).name || id;

const initial = (u) => String(u.name || u.email || '?').trim().charAt(0).toUpperCase() || '?';

/** The people holding a role, as initials. Names on hover, because eight of them will not fit. */
function People({ holders }) {
  if (!holders.length) return <span className="text-[11px] text-slate-600">Nobody yet</span>;
  return (
    <div className="flex items-center -space-x-1.5">
      {holders.slice(0, 5).map(u => (
        <span
          key={u.id}
          title={[u.name, u.email, u.status && u.status !== 'Active' ? u.status : null].filter(Boolean).join(' · ')}
          className={`w-6 h-6 rounded-full border border-brand-primary-lighter flex items-center justify-center text-[9px] font-bold ${
            u.status && u.status !== 'Active'
              ? 'bg-white/5 text-slate-500'
              : 'bg-brand-accent/20 text-brand-accent'
          }`}
        >
          {initial(u)}
        </span>
      ))}
      {holders.length > 5 && (
        <span className="w-6 h-6 rounded-full bg-white/5 border border-brand-primary-lighter flex items-center justify-center text-[9px] font-bold text-slate-400">
          +{holders.length - 5}
        </span>
      )}
    </div>
  );
}

/** full / view / none as one bar, so a card says what it grants without being opened. */
function AccessBar({ role }) {
  const s = roleSummary(role);
  const total = s.full + s.view + s.none || 1;
  return (
    <div
      className="flex h-1.5 rounded-full overflow-hidden bg-white/5"
      title={`${s.full} full · ${s.view} view only · ${s.none} no access`}
    >
      {['full', 'view', 'none'].map(k => (
        s[k] > 0 ? <span key={k} className={ACCESS_BAR[k]} style={{ width: `${(s[k] / total) * 100}%` }} /> : null
      ))}
    </div>
  );
}

export default function Roles() {
  const { user, users, roles, rolesError, fetchRoles } = useAuth();
  const [editing, setEditing] = useState(null);   // the role id being edited
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // With no table to read, show the matrix compiled into the app rather than an
  // empty page: it is what everyone's access is actually being decided by, so
  // hiding it would be the one misleading thing to do. Read-only until the
  // table exists, because there is nowhere to save a change to.
  const usingFallback = roles.length === 0;
  const shown = useMemo(
    () => (usingFallback ? fallbackRoles(PERMISSIONS, FALLBACK_LEVELS) : roles),
    [usingFallback, roles],
  );

  const byRole = useMemo(() => peopleByRole(users), [users]);
  const orphans = useMemo(() => orphanedRoles(users, shown), [users, shown]);

  const role = shown.find(r => r.id === editing) || null;
  const readOnly = !!role?.isFallback;
  const editingOwnRole = role && user?.role === role.id;

  const save = async (patch) => {
    if (!role) return false;
    if (readOnly) {
      setError('These are the permissions built into the app. Run CREATE_ROLES.sql to be able to edit them.');
      return false;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('roles').update(patch).eq('id', role.id);
    setSaving(false);
    if (err) { setError('Could not save: ' + err.message); return false; }
    await fetchRoles();
    setSaved(true);
    return true;
  };

  const setAccess = async (moduleId, access) => {
    const refusal = rejectPermissionChange({ role, moduleId, access, editingOwnRole });
    if (refusal) { setError(refusal); return; }
    await save({ permissions: { ...(role.permissions || {}), [moduleId]: access } });
  };

  const setGroupAccess = async (group, access) => {
    const ids = MODULES.filter(m => m.group === group).map(m => m.id);
    // One refusal stops the whole group, rather than applying half of it.
    for (const id of ids) {
      const refusal = rejectPermissionChange({ role, moduleId: id, access, editingOwnRole });
      if (refusal) { setError(refusal); return; }
    }
    const next = { ...(role.permissions || {}) };
    ids.forEach(id => { next[id] = access; });
    await save({ permissions: next });
  };

  /** Copying is the common case: a role is nearly always a variation on one that exists. */
  const copyFrom = async (sourceId) => {
    const source = shown.find(r => r.id === sourceId);
    if (!source) return;
    const next = {};
    MODULES.forEach(m => { next[m.id] = source.permissions?.[m.id] || 'none'; });
    for (const m of MODULES) {
      const refusal = rejectPermissionChange({ role, moduleId: m.id, access: next[m.id], editingOwnRole });
      if (refusal) { setError(refusal); return; }
    }
    await save({ permissions: next });
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchRoles();
    setRefreshing(false);
  };

  const open = (id) => { setEditing(id); setError(''); setSaved(false); };

  // ── The list ───────────────────────────────────────────────────────────
  if (!role) {
    const q = query.trim().toLowerCase();
    const filtered = shown.filter(r => {
      if (levelFilter !== 'all' && r.level !== levelFilter) return false;
      if (!q) return true;
      return `${r.name} ${r.description || ''}`.toLowerCase().includes(q);
    });

    const assigned = shown.reduce((n, r) => n + holdersOf(byRole, r.id).length, 0);
    const unheld = shown.filter(r => holdersOf(byRole, r.id).length === 0).length;
    const orphanNames = Object.keys(orphans);

    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          icon={Shield}
          title="Roles & Permissions"
          subtitle="What each role can reach. Change it here instead of asking for a code change."
          actions={
            <Button onClick={refresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </Button>
          }
        />

        {/* Where the people are, which is what the screen is usually opened to find out */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Roles" value={shown.length} icon={Shield} tone="accent" />
          <StatCard label="People assigned" value={assigned} icon={Users} tone="info" />
          <StatCard
            label="Roles nobody holds"
            value={unheld}
            tone={unheld > 0 ? 'warning' : 'accent'}
            hint={unheld > 0 ? 'Defined, but not given to anyone yet' : undefined}
          />
        </div>

        {usingFallback && (
          <div className="glass-panel rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {rolesError && rolesError !== 'missing' ? (
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <span className="font-bold">The roles could not be read.</span>{' '}
                    {rolesError} Nobody has lost any access — what you see below is the matrix built into the
                    app, which is what is deciding permissions in the meantime.
                  </p>
                ) : (
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <span className="font-bold">The roles table has not been created yet.</span> Everyone keeps
                    exactly the access they had — these are the permissions built into the app, and they are what
                    is being enforced. They are shown read-only because there is nowhere yet to save a change to.
                  </p>
                )}
                <p className="text-[11px] text-amber-300/70 leading-relaxed mt-2">
                  To make them editable: Supabase dashboard &rarr; SQL Editor &rarr; New query &rarr; paste all of{' '}
                  <span className="font-mono text-amber-200">CREATE_ROLES.sql</span> &rarr; Run, then Refresh above.
                  The same {shown.length} roles appear here, unchanged and editable.
                </p>
              </div>
            </div>
          </div>
        )}

        {orphanNames.length > 0 && (
          <div className="glass-panel rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
            <p className="text-xs text-rose-300 leading-relaxed flex gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
              <span>
                <span className="font-bold">
                  {orphanNames.length === 1
                    ? 'One role is held by somebody but not defined here'
                    : `${orphanNames.length} roles are held by somebody but not defined here`}:
                </span>{' '}
                {orphanNames.map(n => `${n} (${orphans[n].length})`).join(', ')}. An unrecognised role is given
                no access at all, so those accounts can sign in and find every screen closed. Change their role
                on Team Members, or add a role with that exact name.
              </span>
            </p>
          </div>
        )}

        {/* Search and level filter. Fifteen roles is already more than a screenful. */}
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search roles"
          />
          <div className="flex gap-1 flex-wrap">
            {[{ id: 'all', name: 'All' }, ...ROLE_LEVELS].map(l => (
              <button
                key={l.id}
                onClick={() => setLevelFilter(l.id)}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  levelFilter === l.id
                    ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                    : 'border-white/5 text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                {l.name}
                <span className="text-slate-600 ml-1">
                  {l.id === 'all' ? shown.length : shown.filter(r => r.level === l.id).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">No role matches that.</p>
        ) : (
          // Grouped by level, because that is what decides how much a role can do.
          ROLE_LEVELS.filter(l => filtered.some(r => r.level === l.id)).map(l => (
            <div key={l.id} className="space-y-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wide">{l.name}</h2>
                <span className="text-[10px] text-slate-600">{l.hint}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.filter(r => r.level === l.id).map(r => {
                  const holders = holdersOf(byRole, r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => open(r.id)}
                      className="glass-panel rounded-2xl border border-white/5 p-5 text-left hover:border-brand-accent/30 transition-colors flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${LEVEL_STYLE[r.level] || LEVEL_STYLE.staff}`}>
                          {levelName(r.level)}
                        </span>
                        {r.active === false
                          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-white/5 text-slate-500 border-white/10">Off</span>
                          : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</span>}
                      </div>

                      <h3 className="font-bold text-white text-base">{r.name}</h3>
                      <p className="text-xs text-slate-400 mt-1 mb-3 leading-relaxed flex-1 min-h-[2.5rem]">{r.description}</p>

                      <AccessBar role={r} />

                      <div className="flex items-end justify-between mt-3 pt-3 border-t border-white/5 gap-3">
                        <div className="min-w-0">
                          <People holders={holders} />
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">
                            {holders.length === 1 ? '1 person' : `${holders.length} people`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-extrabold text-brand-accent leading-none">{grantedCount(r)}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">of {MODULES.length} screens</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ── One role ───────────────────────────────────────────────────────────
  const locked = isAdminLevel(role.level) || readOnly;
  const summary = roleSummary(role);
  const holders = holdersOf(byRole, role.id);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button onClick={() => { setEditing(null); setError(''); }}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mb-2">
            <ChevronLeft size={14} /> All roles
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={22} className="text-brand-accent" /> {role.name}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{role.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${LEVEL_STYLE[role.level] || LEVEL_STYLE.staff}`}>
            {levelName(role.level)}
          </span>
          {saving && <span className="text-[10px] text-slate-400">Saving…</span>}
          {!saving && saved && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={10} /> Saved</span>
          )}
        </div>
      </div>

      {/* What this role amounts to, and who is affected by changing it */}
      <div className="glass-panel rounded-2xl border border-white/5 p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: 'full', label: 'Full access', tone: 'text-emerald-400' },
            { k: 'view', label: 'View only', tone: 'text-amber-400' },
            { k: 'none', label: 'No access', tone: 'text-slate-500' },
          ].map(s => (
            <div key={s.k}>
              <p className={`text-xl font-extrabold ${s.tone}`}>{summary[s.k]}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
        <AccessBar role={role} />
        <div className="flex items-center gap-2 pt-3 border-t border-white/5">
          <Users size={13} className="text-slate-500 flex-shrink-0" />
          <People holders={holders} />
          <span className="text-[11px] text-slate-500 truncate">
            {holders.length === 0
              ? 'Nobody holds this role, so changing it affects no one yet.'
              : `${holders.map(u => u.name).join(', ')} — a change here reaches them on their next page load.`}
          </span>
        </div>
      </div>

      {error && (
        <div className="glass-panel rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
          <p className="text-xs text-rose-400 leading-relaxed">{error}</p>
        </div>
      )}

      {locked && (
        <div className="glass-panel rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-[11px] text-amber-300 leading-relaxed flex gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
            <span>
              {readOnly
                ? 'This is the matrix built into the app, and it is what is being enforced right now. Run CREATE_ROLES.sql and this same role becomes editable here.'
                : 'An administrator role has everything, and cannot be restricted — take a permission away and there would be nobody left who could give it back. Change its level below if that is not what you want.'}
            </span>
          </p>
        </div>
      )}

      {/* Level and whether the role is in use at all */}
      <div className="glass-panel rounded-2xl border border-white/5 p-5">
        <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Level</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLE_LEVELS.map(l => (
            <button
              key={l.id}
              disabled={readOnly || saving}
              onClick={() => save({ level: l.id })}
              className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors disabled:cursor-not-allowed ${
                role.level === l.id
                  ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                  : 'border-white/5 text-slate-300 hover:bg-white/5'
              }`}
            >
              <span className="font-bold block">{l.name}</span>
              <span className="text-[10px] text-slate-500 leading-snug">{l.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          The name cannot change: every account stores it, so renaming this role would leave {holders.length} people
          without one.
        </p>
      </div>

      {/* Start from a role that already works, rather than twenty-one clicks */}
      {!locked && (
        <div className="glass-panel rounded-2xl border border-white/5 p-5">
          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <Copy size={12} /> Copy permissions from
          </p>
          <select
            value=""
            disabled={saving}
            onChange={e => { const v = e.target.value; if (v) copyFrom(v); }}
            className="w-full bg-brand-primary-lighter/30 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent/40 disabled:opacity-40"
          >
            <option value="">Choose a role…</option>
            {shown.filter(r => r.id !== role.id && !isAdminLevel(r.level)).map(r => (
              <option key={r.id} value={r.id}>{r.name} — {grantedCount(r)} of {MODULES.length}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-2">
            Replaces all {MODULES.length} permissions below with that role&rsquo;s. Administrator roles are not
            offered: copying one would grant everything without making this an administrator, which is not what
            it would look like afterwards.
          </p>
        </div>
      )}

      {/* The matrix */}
      <div className="space-y-4">
        {MODULE_GROUPS.map(group => {
          const mods = MODULES.filter(m => m.group === group);
          const granted = locked
            ? mods.length
            : mods.filter(m => (role.permissions?.[m.id] || 'none') !== 'none').length;
          return (
            <div key={group} className="glass-panel rounded-2xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h3 className="text-sm font-bold text-white">
                  {group}
                  <span className="text-[11px] font-normal text-slate-500 ml-2">{granted} of {mods.length}</span>
                </h3>
                {!locked && (
                  <div className="flex gap-1">
                    {['none', 'view', 'full'].map(a => (
                      <button key={a} disabled={saving}
                        onClick={() => setGroupAccess(group, a)}
                        className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40">
                        All {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {mods.map(m => {
                  const access = locked ? 'full' : (role.permissions?.[m.id] || 'none');
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-brand-primary-lighter/20 px-3 py-2">
                      <span className="text-xs text-white flex items-center gap-1.5 min-w-0">
                        {locked && <Lock size={11} className="text-amber-400/70 flex-shrink-0" />}
                        <span className="truncate">{m.name}</span>
                      </span>
                      <div className="flex gap-1 flex-shrink-0" role="radiogroup" aria-label={`Access to ${m.name}`}>
                        {['none', 'view', 'full'].map(a => (
                          <button
                            key={a}
                            role="radio"
                            aria-checked={access === a}
                            disabled={locked || saving}
                            onClick={() => setAccess(m.id, a)}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors disabled:cursor-not-allowed ${
                              access === a ? ACCESS_STYLE[a] : 'border-white/5 text-slate-600 hover:text-slate-300'
                            }`}
                          >
                            {access === a && <Check size={9} className="inline mr-0.5" />}
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed">
        {readOnly
          ? 'Nothing here can be saved yet, because the roles table does not exist. Until it does, these permissions are read from the app itself.'
          : 'Saved as you go. Anyone signed in picks the change up on their next page load — they do not need to sign out and back in.'}
      </p>
    </div>
  );
}
