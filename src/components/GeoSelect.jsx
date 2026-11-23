import { useState } from 'react';
import { stateOptions, cityOptions, matchName, existingCity, nameProblem, cleanCityName } from '../utils/geo';

/**
 * The State and City dropdowns, one component for every screen.
 *
 * `geo` comes from useData().geo (signed in) or usePublicGeo() (sign-up pages).
 * onChange gets the chosen text, not an event. A stored value that is not in
 * the list is still offered (marked), so an old row can be opened and saved.
 * Roles that may add a city (geo.canAdd) get "+ Add city…" at the end of the
 * City list: it opens a small box under the dropdown, blocks duplicates (any
 * capitals or spaces) and selects the new city.
 */
export function StateSelect({
  geo, value, onChange, id, className = '', style, disabled, required, placeholder = '-- Select State --',
  optionClassName = 'bg-brand-primary', ...rest
}) {
  const options = stateOptions(geo, value);
  const shown = matchName(options, value);
  return (
    <select id={id} value={shown} onChange={e => onChange(e.target.value)} disabled={disabled} required={required}
      className={className} style={style} {...rest}>
      <option value="" className={optionClassName}>{placeholder}</option>
      {options.map(s => (
        <option key={s} value={s} className={optionClassName}>
          {geo?.stateNames?.includes(s) ? s : `${s} (not in list)`}
        </option>
      ))}
    </select>
  );
}

/** The small "new city" box: tidies the name, blocks duplicates (any capitals/spaces), asks the database to add it. */
export function AddCityBox({ geo, state, onAdded, onCancel }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const submit = async () => {
    const wanted = cleanCityName(name);
    const bad = nameProblem(wanted, 'city');
    if (bad) { setProblem(bad); return; }
    const dup = existingCity(geo, state, wanted);
    if (dup) { onAdded(dup); return; }
    setBusy(true);
    const res = await geo.addCity(state, wanted);
    setBusy(false);
    if (!res.ok) { setProblem(res.error); return; }
    onAdded(res.name);
  };


  return (
    <div className="mt-2" data-testid="add-city-box">
      <div className="flex gap-2">
        <input type="text" autoFocus value={name} maxLength={60} placeholder={`New city in ${state}`}
          aria-label={`New city in ${state}`}
          onChange={e => { setName(e.target.value); setProblem(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') onCancel(); }}
          className="flex-1 min-w-0 glass-input h-10 px-3 text-sm" />
        <button type="button" onClick={submit} disabled={busy}
          className="px-3 h-10 rounded-lg text-sm font-semibold bg-brand-accent text-white disabled:opacity-60">
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="px-3 h-10 rounded-lg text-sm text-slate-300 border border-white/10">Cancel</button>
      </div>
      {problem && <p className="mt-1 text-xs text-rose-400" role="alert">{problem}</p>}
    </div>
  );
}

const ADD = '__add_city__';

export function CitySelect({
  geo, state, value, onChange, id, className = '', style, disabled, required, placeholder = '-- Select --',
  optionClassName = 'bg-brand-primary', ...rest
}) {
  const [adding, setAdding] = useState(false);

  const options = cityOptions(geo, state, value);
  const inList = (c) => (geo?.citiesOf(state) || []).includes(c);
  const canAdd = Boolean(state && geo?.canAdd && geo.addCity);

  // A state with no cities listed and nobody allowed to add one: a text box, as before.
  if (state && !options.length && !canAdd) {
    return (
      <input id={id} type="text" value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
        required={required} placeholder={`Enter city in ${state}...`} className={className} style={style} {...rest} />
    );
  }

  return (
    <>
      <select id={id} value={matchName(options, value)} disabled={disabled || !state} required={required}
        onChange={e => {
          if (e.target.value === ADD) { setAdding(true); return; }
          setAdding(false);
          onChange(e.target.value);
        }}
        className={className} style={style} {...rest}>
        <option value="" className={optionClassName}>{placeholder}</option>
        {options.map(c => (
          <option key={c} value={c} className={optionClassName}>{inList(c) ? c : `${c} (not in list)`}</option>
        ))}
        {canAdd && <option value={ADD} className={optionClassName}>+ Add city…</option>}
      </select>
      {adding && canAdd && (
        <AddCityBox geo={geo} state={state} onAdded={(n) => { onChange(n); setAdding(false); }} onCancel={() => setAdding(false)} />
      )}
    </>
  );
}
