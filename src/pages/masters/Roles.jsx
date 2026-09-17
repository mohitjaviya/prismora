import { useState, useMemo } from 'react';
import { useAuth, PERMISSIONS, FALLBACK_LEVELS } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { Shield, ChevronLeft, Lock, AlertTriangle, Check } from 'lucide-react';
import {
  MODULES, MODULE_GROUPS, ROLE_LEVELS, grantedCount, isAdminLevel, rejectPermissionChange,
  fallbackRoles,
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

const LEVEL_STYLE = {
  admin: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  manager: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  sales: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  staff: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
  partner: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
};

export default function Roles() {
  const { user, users, roles, rolesError, fetchRoles } = useAuth();
  const [editing, setEditing] = useState(null);   // the role id being edited
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const usersPerRole = useMemo(() => {
    const counts = {};
    (users || []).forEach(u => { counts[u.role] = (counts[u.role] || 0) + 1; });
    return counts;
  }, [users]);

  // With no table to read, show the matrix compiled into the app rather than an
  // empty page: it is what everyone's access is actually being decided by, so
  // hiding it would be the one misleading thing to do. Read-only until the
  // table exists, because there is nowhere to save a change to.
  const usingFallback = roles.length === 0;
  const shown = useMemo(
    () => (usingFallback ? fallbackRoles(PERMISSIONS, FALLBACK_LEVELS) : roles),
    [usingFallback, roles],
  );

  const role = shown.find(r => r.id === editing) || null;
  const readOnly = !!role?.isFallback;
  const editingOwnRole = role && user?.role === role.id;

  const save = async (patch) => {
    if (!role) return;
    if (readOnly) { setError('These are the permissions built into the app. Run CREATE_ROLES.sql to be able to edit them.'); return false; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('roles').update(patch).eq('id', role.id);
    setSaving(false);
    if (err) { setError('Could not save: ' + err.message); return false; }
    await fetchRoles();
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

  // ── The list ───────────────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={24} className="text-brand-accent" /> Roles &amp; Permissions
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            What each role can reach. Change it here instead of asking for a code change.
          </p>
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
                  <span className="font-mono text-amber-200">CREATE_ROLES.sql</span> &rarr; Run. The same fifteen
                  roles appear here, unchanged and editable.
                </p>
                <button
                  onClick={() => fetchRoles()}
                  className="mt-3 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors"
                >
                  Check again
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(r => (
            <button
              key={r.id}
              onClick={() => { setEditing(r.id); setError(''); }}
              className="glass-panel rounded-2xl border border-white/5 p-5 text-left hover:border-brand-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${LEVEL_STYLE[r.level] || LEVEL_STYLE.staff}`}>
                  {(ROLE_LEVELS.find(l => l.id === r.level) || {}).name || r.level}
                </span>
                {r.active === false
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-white/5 text-slate-500 border-white/10">Off</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</span>}
              </div>

              <h3 className="font-bold text-white text-base">{r.name}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed min-h-[2.5rem]">{r.description}</p>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <div>
                  <p className="text-lg font-extrabold text-white">{usersPerRole[r.id] || 0}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">People</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-brand-accent">{grantedCount(r)}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">of {MODULES.length} screens</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── One role ───────────────────────────────────────────────────────────
  const locked = isAdminLevel(role.level) || readOnly;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => { setEditing(null); setError(''); }}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mb-2">
            <ChevronLeft size={14} /> All roles
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={22} className="text-brand-accent" /> {role.name}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{role.description}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${LEVEL_STYLE[role.level] || LEVEL_STYLE.staff}`}>
          {(ROLE_LEVELS.find(l => l.id === role.level) || {}).name || role.level}
        </span>
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
        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Level</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLE_LEVELS.map(l => (
            <button
              key={l.id}
              disabled={readOnly || saving}
              onClick={() => save({ level: l.id })}
              className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
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
          The name cannot change: every account stores it, so renaming this role would leave {usersPerRole[role.id] || 0} people
          without one.
        </p>
      </div>

      {/* The matrix */}
      <div className="space-y-4">
        {MODULE_GROUPS.map(group => {
          const mods = MODULES.filter(m => m.group === group);
          return (
            <div key={group} className="glass-panel rounded-2xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-3 gap-3">
                <h3 className="text-sm font-bold text-white">{group}</h3>
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
                      <div className="flex gap-1 flex-shrink-0">
                        {['none', 'view', 'full'].map(a => (
                          <button
                            key={a}
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
